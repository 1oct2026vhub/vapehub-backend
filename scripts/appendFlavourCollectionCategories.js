/**
 * Append flavour collection categories to products from Matt's CSV (additive only).
 *
 * Usage:
 *   npm run append:flavour-categories -- --dry-run
 *   npm run append:flavour-categories -- --apply
 *   npm run append:flavour-categories -- --csv "path/to/file.csv" --apply
 *
 * Options:
 *   --dry-run          Report planned inserts without writing (default)
 *   --apply            Insert missing product_categories rows
 *   --csv <path>       CSV file path (defaults to repo-root flavour assignments CSV)
 *   --skip-cache       Skip Redis cache invalidation
 *   --skip-menu-sync   Skip syncProductToMenus for published products
 *   --updated-by <id>  User ID for menu sync audit fields (optional)
 */

const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');

const DEFAULT_CSV = path.resolve(
    __dirname,
    '../../VapeHub — Flavour Collection Product Assignments (June 2026) - Flavour Assignments (1).csv'
);

const FLAVOUR_NAMES = [
    'Cherry',
    'Blueberry',
    'Mango',
    'Grape',
    'Blue Raspberry',
    'Apple',
    'Watermelon',
    'Candy',
    'Berry'
];

const SLUG_ALIASES = {
    'Cherry': ['cherry'],
    'Blueberry': ['blueberry'],
    'Mango': ['mango'],
    'Grape': ['grape'],
    'Blue Raspberry': ['blue-raspberry', 'blue-raspbery'],
    'Apple': ['apple'],
    'Watermelon': ['watermelon'],
    'Candy': ['candy'],
    'Berry': ['berry']
};

function parseArgs(argv) {
    const args = {
        dryRun: true,
        csvPath: DEFAULT_CSV,
        skipCache: false,
        skipMenuSync: false,
        updatedBy: null
    };

    for (let i = 2; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--apply') {
            args.dryRun = false;
        } else if (arg === '--dry-run') {
            args.dryRun = true;
        } else if (arg === '--skip-cache') {
            args.skipCache = true;
        } else if (arg === '--skip-menu-sync') {
            args.skipMenuSync = true;
        } else if (arg === '--csv') {
            args.csvPath = path.resolve(argv[i + 1]);
            i += 1;
        } else if (arg === '--updated-by') {
            args.updatedBy = Number(argv[i + 1]);
            i += 1;
        }
    }

    return args;
}

function parseCsvLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i += 1) {
        const char = line[i];
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i += 1;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    values.push(current);
    return values;
}

function parseCsv(content) {
    const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);
    if (!lines.length) {
        return [];
    }

    const headers = parseCsvLine(lines[0]).map((header) => header.replace(/^\uFEFF/, '').trim());
    return lines.slice(1).map((line) => {
        const values = parseCsvLine(line);
        const row = {};
        headers.forEach((header, index) => {
            row[header] = (values[index] || '').trim();
        });
        return row;
    });
}

function slugFromProductUrl(url) {
    if (!url) {
        return null;
    }

    try {
        const parsed = new URL(url.trim());
        return parsed.pathname.replace(/^\/+|\/+$/g, '');
    } catch {
        return null;
    }
}

function parseCategoryNames(categoriesNeeded) {
    return (categoriesNeeded || '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
}

async function buildFlavourCategoryMap(Category) {
    const categories = await Category.findAll({
        where: {
            [Op.or]: [
                { name: { [Op.in]: FLAVOUR_NAMES } },
                { slug: { [Op.in]: Object.values(SLUG_ALIASES).flat() } }
            ]
        },
        attributes: ['id', 'name', 'slug']
    });

    const byName = new Map();
    const bySlug = new Map();
    for (const category of categories) {
        byName.set(category.name.trim().toLowerCase(), category);
        bySlug.set(category.slug.trim().toLowerCase(), category);
    }

    const map = new Map();
    const missing = [];

    for (const flavourName of FLAVOUR_NAMES) {
        const direct = byName.get(flavourName.toLowerCase());
        if (direct) {
            map.set(flavourName, direct);
            continue;
        }

        const aliases = SLUG_ALIASES[flavourName] || [];
        const byAlias = aliases
            .map((slug) => bySlug.get(slug.toLowerCase()))
            .find(Boolean);

        if (byAlias) {
            map.set(flavourName, byAlias);
        } else {
            missing.push(flavourName);
        }
    }

    return { map, missing };
}

async function resolveProductId(row, Product) {
    const rawId = (row['Product ID'] || '').trim();
    if (rawId) {
        const productId = Number(rawId);
        if (!Number.isInteger(productId) || productId <= 0) {
            return { error: `Invalid Product ID: ${rawId}` };
        }

        const product = await Product.findByPk(productId, { attributes: ['id', 'name', 'slug', 'status'] });
        if (!product) {
            return { error: `Product not found for ID ${productId}` };
        }

        return { product };
    }

    const slug = slugFromProductUrl(row['Product URL']);
    if (!slug) {
        return { error: 'Missing Product ID and unable to derive slug from Product URL' };
    }

    const product = await Product.findOne({
        where: { slug },
        attributes: ['id', 'name', 'slug', 'status']
    });

    if (!product) {
        return { error: `Product not found for slug "${slug}"` };
    }

    return { product, resolvedBy: 'slug' };
}

async function invalidateProductCaches(invalidateCachePattern, invalidateCache, productIds) {
    await invalidateCachePattern('products:*');
    await invalidateCachePattern('product:new:*');
    await invalidateCachePattern('category:products:*');
    if (productIds.length) {
        await invalidateCache(productIds.map((id) => `product:detail:${id}`));
    }
}

function printSummary(summary) {
    console.log('\n=== Flavour collection category append summary ===');
    console.log(`Mode:                 ${summary.mode}`);
    console.log(`CSV:                  ${summary.csvPath}`);
    console.log(`Rows in CSV:          ${summary.totalRows}`);
    console.log(`Rows processed:       ${summary.processedRows}`);
    console.log(`Rows skipped:         ${summary.skippedRows}`);
    console.log(`Rows with errors:     ${summary.errorRows}`);
    console.log(`Links to insert:      ${summary.linksToInsert}`);
    console.log(`Links already exist:  ${summary.linksAlreadyExist}`);
    console.log(`Links inserted:       ${summary.linksInserted}`);
    console.log(`Menu sync attempted:  ${summary.menuSyncAttempted}`);
    console.log(`Menu sync succeeded:  ${summary.menuSyncSucceeded}`);
    console.log(`Report file:          ${summary.reportPath}`);

    if (summary.errors.length) {
        console.log('\nErrors:');
        for (const error of summary.errors) {
            console.log(`- ${error}`);
        }
    }

    if (summary.skipped.length) {
        console.log('\nSkipped rows:');
        for (const item of summary.skipped) {
            console.log(`- ${item}`);
        }
    }
}

async function main() {
    const args = parseArgs(process.argv);

    if (!fs.existsSync(args.csvPath)) {
        throw new Error(`CSV file not found: ${args.csvPath}`);
    }

    await require('../config/dotenv').loadEnvFile();

    const db = require('../models');
    const { Product, Category, ProductCategory, sequelize } = db;

    await sequelize.authenticate();

    const csvContent = fs.readFileSync(args.csvPath, 'utf8');
    const rows = parseCsv(csvContent);

    const { map: flavourCategoryMap, missing: missingFlavours } = await buildFlavourCategoryMap(Category);
    if (missingFlavours.length) {
        throw new Error(
            `Missing flavour categories in database: ${missingFlavours.join(', ')}. ` +
            'Create them before running this script.'
        );
    }

    const summary = {
        mode: args.dryRun ? 'dry-run' : 'apply',
        csvPath: args.csvPath,
        totalRows: rows.length,
        processedRows: 0,
        skippedRows: 0,
        errorRows: 0,
        linksToInsert: 0,
        linksAlreadyExist: 0,
        linksInserted: 0,
        menuSyncAttempted: 0,
        menuSyncSucceeded: 0,
        errors: [],
        skipped: [],
        details: [],
        inserted: []
    };

    const touchedProductIds = new Set();
    const transaction = args.dryRun ? null : await sequelize.transaction();

    let syncProductToMenus;
    let invalidateCachePattern;
    let invalidateCache;
    let closeRedis;

    if (!args.dryRun) {
        ({ invalidateCachePattern, invalidateCache, closeRedis } = require('../library/cache'));
        ({ syncProductToMenus } = require('../components/admin/menu/domain/menu.controller'));
    }

    try {
        for (const row of rows) {
            const productName = row['Product Name'] || 'Unknown product';
            const categoryNames = parseCategoryNames(row['Categories Needed']);

            if (!categoryNames.length) {
                summary.skippedRows += 1;
                summary.skipped.push(`${productName}: no categories listed`);
                continue;
            }

            const resolution = await resolveProductId(row, Product);
            if (resolution.error) {
                summary.errorRows += 1;
                summary.errors.push(`${productName}: ${resolution.error}`);
                continue;
            }

            const { product, resolvedBy } = resolution;
            const categoryIds = categoryNames.map((name) => {
                const category = flavourCategoryMap.get(name);
                if (!category) {
                    return null;
                }
                return category.id;
            });

            const unknownNames = categoryNames.filter((name) => !flavourCategoryMap.has(name));
            if (unknownNames.length) {
                summary.errorRows += 1;
                summary.errors.push(`${productName}: unknown category names in CSV: ${unknownNames.join(', ')}`);
                continue;
            }

            const existingLinks = await ProductCategory.findAll({
                where: { product_id: product.id },
                attributes: ['category_id', 'is_primary'],
                ...(transaction ? { transaction } : {})
            });
            const existingCategoryIds = new Set(existingLinks.map((link) => link.category_id));
            const toInsert = [...new Set(categoryIds)].filter((categoryId) => !existingCategoryIds.has(categoryId));
            const alreadyLinked = categoryIds.filter((categoryId) => existingCategoryIds.has(categoryId));

            summary.processedRows += 1;
            summary.linksToInsert += toInsert.length;
            summary.linksAlreadyExist += alreadyLinked.length;

            const detail = {
                productId: product.id,
                productName: product.name,
                resolvedBy: resolvedBy || 'id',
                categoriesRequested: categoryNames,
                categoriesToInsert: toInsert.map((categoryId) => {
                    const category = [...flavourCategoryMap.values()].find((item) => item.id === categoryId);
                    return { id: categoryId, name: category?.name || categoryId };
                }),
                categoriesAlreadyLinked: alreadyLinked.map((categoryId) => {
                    const category = [...flavourCategoryMap.values()].find((item) => item.id === categoryId);
                    return { id: categoryId, name: category?.name || categoryId };
                })
            };
            summary.details.push(detail);

            if (!toInsert.length) {
                continue;
            }

            if (args.dryRun) {
                continue;
            }

            const created = await ProductCategory.bulkCreate(
                toInsert.map((categoryId) => ({
                    product_id: product.id,
                    category_id: categoryId,
                    is_primary: false
                })),
                { transaction, ignoreDuplicates: true }
            );

            summary.linksInserted += created.length;
            touchedProductIds.add(product.id);

            for (const link of created) {
                summary.inserted.push({
                    product_category_id: link.id,
                    product_id: product.id,
                    category_id: link.category_id
                });
            }

            if (!args.skipMenuSync && product.status === 'published') {
                summary.menuSyncAttempted += 1;
                try {
                    const menuResult = await syncProductToMenus(product.id, transaction, args.updatedBy);
                    if (menuResult?.synced) {
                        summary.menuSyncSucceeded += 1;
                    }
                } catch (menuError) {
                    summary.errors.push(
                        `${product.name} (ID ${product.id}): menu sync failed - ${menuError.message}`
                    );
                }
            }
        }

        if (transaction) {
            await transaction.commit();
        }

        if (!args.dryRun && !args.skipCache && touchedProductIds.size) {
            await invalidateProductCaches(
                invalidateCachePattern,
                invalidateCache,
                [...touchedProductIds]
            );
        }
    } catch (error) {
        if (transaction) {
            await transaction.rollback();
        }
        throw error;
    } finally {
        if (closeRedis) {
            await closeRedis();
        }
        await sequelize.close();
    }

    const outputDir = path.resolve(__dirname, 'output');
    fs.mkdirSync(outputDir, { recursive: true });
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = path.join(outputDir, `append-flavour-categories-${timestamp}.json`);
    summary.reportPath = reportPath;
    fs.writeFileSync(reportPath, JSON.stringify(summary, null, 2));

    printSummary(summary);

    if (summary.errorRows > 0) {
        process.exitCode = 1;
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
