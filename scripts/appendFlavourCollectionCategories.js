/**
 * Append flavour collection attribute terms to products from Matt's CSV (additive only).
 *
 * Resolves CSV "Categories Needed" values against Flavour/Flavor attribute terms
 * and inserts missing product_attribute_terms rows. Does not create variants,
 * does not set used_in_variation, and does not remove existing links.
 *
 * Usage:
 *   npm run append:flavour-categories -- --dry-run
 *   npm run append:flavour-categories -- --apply --updated-by 1
 *   npm run append:flavour-categories -- --csv "path/to/file.csv" --apply --updated-by 1
 *
 * Options:
 *   --dry-run          Report planned inserts without writing (default)
 *   --apply            Insert missing product_attribute_terms rows
 *   --csv <path>       CSV file path (defaults to public/docs flavour assignments CSV)
 *   --skip-cache       Skip Redis cache invalidation
 *   --updated-by <id>  User ID for product_attribute_terms.updated_by (required with --apply)
 */

const fs = require('fs');
const path = require('path');
const { Op } = require('sequelize');

const DEFAULT_CSV = path.resolve(
    __dirname,
    '../public/docs/VapeHub — Flavour Collection Product Assignments (June 2026) - Flavour Assignments.csv'
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
    Cherry: ['cherry'],
    Blueberry: ['blueberry'],
    Mango: ['mango'],
    Grape: ['grape'],
    'Blue Raspberry': ['blue-raspberry', 'blue-raspbery'],
    Apple: ['apple'],
    Watermelon: ['watermelon'],
    Candy: ['candy'],
    Berry: ['berry']
};

const FLAVOUR_ATTRIBUTE_NAMES = ['Flavour', 'Flavor'];
const FLAVOUR_ATTRIBUTE_SLUGS = ['flavour', 'flavor', 'pa_flavour', 'pa_flavor'];

function parseArgs(argv) {
    const args = {
        dryRun: true,
        csvPath: DEFAULT_CSV,
        skipCache: false,
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
            // Kept for backward compatibility with older invocations; no-op now.
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

function parseFlavourNames(categoriesNeeded) {
    return (categoriesNeeded || '')
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean);
}

async function resolveFlavourAttribute(Attribute) {
    const attribute = await Attribute.findOne({
        where: {
            [Op.or]: [
                { name: { [Op.in]: FLAVOUR_ATTRIBUTE_NAMES } },
                { slug: { [Op.in]: FLAVOUR_ATTRIBUTE_SLUGS } }
            ]
        },
        attributes: ['id', 'name', 'slug']
    });

    if (!attribute) {
        throw new Error(
            'Flavour attribute not found. Expected attribute name Flavour/Flavor ' +
            `or slug ${FLAVOUR_ATTRIBUTE_SLUGS.join(', ')}.`
        );
    }

    return attribute;
}

async function buildFlavourTermMap(AttributeTerm, attributeId) {
    const terms = await AttributeTerm.findAll({
        where: {
            attribute_id: attributeId,
            [Op.or]: [
                { name: { [Op.in]: FLAVOUR_NAMES } },
                { slug: { [Op.in]: Object.values(SLUG_ALIASES).flat() } }
            ]
        },
        attributes: ['id', 'name', 'slug', 'attribute_id']
    });

    const byName = new Map();
    const bySlug = new Map();
    for (const term of terms) {
        byName.set(term.name.trim().toLowerCase(), term);
        bySlug.set(term.slug.trim().toLowerCase(), term);
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
    if (productIds.length) {
        await invalidateCache(productIds.map((id) => `product:detail:${id}`));
    }
}

function printSummary(summary) {
    console.log('\n=== Flavour collection attribute-term append summary ===');
    console.log(`Mode:                 ${summary.mode}`);
    console.log(`CSV:                  ${summary.csvPath}`);
    console.log(`Flavour attribute:    ${summary.flavourAttribute}`);
    console.log(`Rows in CSV:          ${summary.totalRows}`);
    console.log(`Rows processed:       ${summary.processedRows}`);
    console.log(`Rows skipped:         ${summary.skippedRows}`);
    console.log(`Rows with errors:     ${summary.errorRows}`);
    console.log(`Links to insert:      ${summary.linksToInsert}`);
    console.log(`Links already exist:  ${summary.linksAlreadyExist}`);
    console.log(`Links inserted:       ${summary.linksInserted}`);
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

    if (!args.dryRun) {
        if (!Number.isInteger(args.updatedBy) || args.updatedBy <= 0) {
            throw new Error('--updated-by <positive user id> is required with --apply');
        }
    }

    await require('../config/dotenv').loadEnvFile();

    const db = require('../models');
    const { Product, Attribute, AttributeTerm, ProductAttributeTerm, sequelize } = db;

    await sequelize.authenticate();

    const csvContent = fs.readFileSync(args.csvPath, 'utf8');
    const rows = parseCsv(csvContent);

    const flavourAttribute = await resolveFlavourAttribute(Attribute);
    const { map: flavourTermMap, missing: missingFlavours } = await buildFlavourTermMap(
        AttributeTerm,
        flavourAttribute.id
    );

    if (missingFlavours.length) {
        throw new Error(
            `Missing flavour attribute terms under "${flavourAttribute.name}" ` +
            `(id ${flavourAttribute.id}): ${missingFlavours.join(', ')}. ` +
            'Create them before running this script.'
        );
    }

    const summary = {
        mode: args.dryRun ? 'dry-run' : 'apply',
        csvPath: args.csvPath,
        flavourAttribute: `${flavourAttribute.name} (id ${flavourAttribute.id}, slug ${flavourAttribute.slug})`,
        totalRows: rows.length,
        processedRows: 0,
        skippedRows: 0,
        errorRows: 0,
        linksToInsert: 0,
        linksAlreadyExist: 0,
        linksInserted: 0,
        errors: [],
        skipped: [],
        details: [],
        inserted: []
    };

    const touchedProductIds = new Set();
    const transaction = args.dryRun ? null : await sequelize.transaction();

    let invalidateCachePattern;
    let invalidateCache;
    let closeRedis;

    if (!args.dryRun) {
        ({ invalidateCachePattern, invalidateCache, closeRedis } = require('../library/cache'));
    }

    try {
        for (const row of rows) {
            const productName = row['Product Name'] || 'Unknown product';
            const flavourNames = parseFlavourNames(row['Categories Needed']);

            if (!flavourNames.length) {
                summary.skippedRows += 1;
                summary.skipped.push(`${productName}: no flavour terms listed`);
                continue;
            }

            const resolution = await resolveProductId(row, Product);
            if (resolution.error) {
                summary.errorRows += 1;
                summary.errors.push(`${productName}: ${resolution.error}`);
                continue;
            }

            const { product, resolvedBy } = resolution;
            const unknownNames = flavourNames.filter((name) => !flavourTermMap.has(name));
            if (unknownNames.length) {
                summary.errorRows += 1;
                summary.errors.push(
                    `${productName}: unknown flavour terms in CSV: ${unknownNames.join(', ')}`
                );
                continue;
            }

            const termIds = flavourNames.map((name) => flavourTermMap.get(name).id);

            const existingLinks = await ProductAttributeTerm.findAll({
                where: {
                    product_id: product.id,
                    attribute_id: flavourAttribute.id,
                    term_id: { [Op.in]: [...new Set(termIds)] }
                },
                attributes: ['id', 'term_id'],
                ...(transaction ? { transaction } : {})
            });
            const existingTermIds = new Set(existingLinks.map((link) => Number(link.term_id)));
            const uniqueTermIds = [...new Set(termIds)];
            const toInsert = uniqueTermIds.filter((termId) => !existingTermIds.has(Number(termId)));
            const alreadyLinked = uniqueTermIds.filter((termId) => existingTermIds.has(Number(termId)));

            summary.processedRows += 1;
            summary.linksToInsert += toInsert.length;
            summary.linksAlreadyExist += alreadyLinked.length;

            const findTermMeta = (termId) => {
                const term = [...flavourTermMap.values()].find((item) => Number(item.id) === Number(termId));
                return { id: termId, name: term?.name || termId, slug: term?.slug || null };
            };

            const detail = {
                productId: product.id,
                productName: product.name,
                resolvedBy: resolvedBy || 'id',
                termsRequested: flavourNames,
                termsToInsert: toInsert.map(findTermMeta),
                termsAlreadyLinked: alreadyLinked.map(findTermMeta)
            };
            summary.details.push(detail);

            if (!toInsert.length) {
                continue;
            }

            if (args.dryRun) {
                continue;
            }

            const created = await ProductAttributeTerm.bulkCreate(
                toInsert.map((termId) => ({
                    product_id: product.id,
                    attribute_id: flavourAttribute.id,
                    term_id: termId,
                    is_visible_page: true,
                    used_in_variation: false,
                    updated_by: args.updatedBy
                })),
                { transaction, ignoreDuplicates: true }
            );

            summary.linksInserted += created.length;
            touchedProductIds.add(product.id);

            for (const link of created) {
                summary.inserted.push({
                    product_attribute_term_id: link.id,
                    product_id: product.id,
                    attribute_id: flavourAttribute.id,
                    term_id: link.term_id
                });
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
    const reportPath = path.join(outputDir, `append-flavour-attribute-terms-${timestamp}.json`);
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
