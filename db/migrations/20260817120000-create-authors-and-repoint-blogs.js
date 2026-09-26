'use strict';

const OVERRIDE_KEYS = [
    'first_name',
    'last_name',
    'role',
    'bio',
    'avatar_url',
    'archive_url',
    'team_url'
];

const slugify = (value) => {
    const slug = String(value || '')
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 90);

    return slug || 'author';
};

const uniqueSlug = (base, usedSlugs) => {
    let slug = base;
    let n = 2;
    while (usedSlugs.has(slug)) {
        slug = `${base}-${n}`.slice(0, 100);
        n += 1;
    }
    usedSlugs.add(slug);
    return slug;
};

const parseOverride = (value) => {
    if (value == null || value === '') {
        return null;
    }

    let parsed = value;
    if (Buffer.isBuffer(value)) {
        parsed = value.toString('utf8');
    }
    if (typeof parsed === 'string') {
        const trimmed = parsed.trim();
        if (!trimmed || trimmed === '{}') {
            return null;
        }
        try {
            parsed = JSON.parse(trimmed);
        } catch {
            return null;
        }
    }
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return null;
    }
    return parsed;
};

const hasOverrideContent = (override) => (
    override
    && OVERRIDE_KEYS.some((key) => {
        const val = override[key];
        return val != null && String(val).trim() !== '';
    })
);

const emptyToNull = (value) => {
    if (value == null) {
        return null;
    }
    const trimmed = String(value).trim();
    return trimmed === '' ? null : trimmed;
};

const buildArchiveUrl = (slug) => (slug ? `/blogs?author=${slug}` : null);

const insertAuthor = async (queryInterface, sequelize, row, transaction) => {
    await queryInterface.bulkInsert('authors', [{
        ...row,
        created_at: new Date(),
        updated_at: new Date()
    }], { transaction });

    if (row.user_id) {
        const [found] = await sequelize.query(
            'SELECT id FROM authors WHERE user_id = :userId ORDER BY id DESC LIMIT 1',
            {
                replacements: { userId: row.user_id },
                type: sequelize.QueryTypes.SELECT,
                transaction
            }
        );
        return found.id;
    }

    const [found] = await sequelize.query(
        'SELECT id FROM authors WHERE slug = :slug ORDER BY id DESC LIMIT 1',
        {
            replacements: { slug: row.slug },
            type: sequelize.QueryTypes.SELECT,
            transaction
        }
    );
    return found.id;
};

const removeAuthorFk = async (queryInterface, transaction) => {
    const fks = await queryInterface.getForeignKeyReferencesForTable('blogs', { transaction });
    const authorFk = fks.find((fk) => fk.columnName === 'author_id' || fk.columnName === 'authorId');
    if (authorFk?.constraintName) {
        await queryInterface.removeConstraint('blogs', authorFk.constraintName, { transaction });
    }
};

/** @type {import('sequelize-cli').Migration} */
module.exports = {
    async up(queryInterface, Sequelize) {
        const sequelize = queryInterface.sequelize;

        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.createTable('authors', {
                id: {
                    type: Sequelize.INTEGER,
                    primaryKey: true,
                    autoIncrement: true,
                    unique: true
                },
                user_id: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    unique: true,
                    references: {
                        model: 'users',
                        key: 'id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'SET NULL'
                },
                first_name: {
                    type: Sequelize.STRING(255),
                    allowNull: false
                },
                last_name: {
                    type: Sequelize.STRING(255),
                    allowNull: true
                },
                role: {
                    type: Sequelize.STRING(255),
                    allowNull: true
                },
                bio: {
                    type: Sequelize.TEXT('long'),
                    allowNull: true
                },
                slug: {
                    type: Sequelize.STRING(100),
                    allowNull: false,
                    unique: true
                },
                avatar_url: {
                    type: Sequelize.STRING(500),
                    allowNull: true
                },
                archive_url: {
                    type: Sequelize.STRING(500),
                    allowNull: true
                },
                team_url: {
                    type: Sequelize.STRING(500),
                    allowNull: true
                },
                updated_by: {
                    type: Sequelize.INTEGER,
                    allowNull: true,
                    references: {
                        model: 'users',
                        key: 'id'
                    },
                    onUpdate: 'CASCADE',
                    onDelete: 'SET NULL'
                },
                created_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP')
                },
                updated_at: {
                    type: Sequelize.DATE,
                    allowNull: false,
                    defaultValue: Sequelize.literal('CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP')
                },
                deleted_at: {
                    type: Sequelize.DATE,
                    allowNull: true
                }
            }, { transaction });

            await queryInterface.addIndex('authors', ['deleted_at'], { transaction });

            await removeAuthorFk(queryInterface, transaction);

            const blogs = await sequelize.query(
                `SELECT id, author_id, author_override, updated_by
                 FROM blogs`,
                { type: sequelize.QueryTypes.SELECT, transaction }
            );

            const userIds = [...new Set(blogs.map((blog) => blog.author_id).filter(Boolean))];
            let users = [];
            if (userIds.length > 0) {
                users = await sequelize.query(
                    `SELECT id, first_name, last_name, profile_pic_url,
                            blog_author_role, blog_author_bio, blog_author_slug,
                            blog_author_archive_url, blog_author_team_url
                     FROM users
                     WHERE id IN (:userIds)`,
                    {
                        replacements: { userIds },
                        type: sequelize.QueryTypes.SELECT,
                        transaction
                    }
                );
            }

            const usersById = new Map(users.map((user) => [user.id, user]));
            const usedSlugs = new Set();
            const userToAuthorId = new Map();

            for (const user of users) {
                const firstName = emptyToNull(user.first_name) || 'Author';
                const lastName = emptyToNull(user.last_name);
                const slug = uniqueSlug(
                    slugify(emptyToNull(user.blog_author_slug) || `${firstName} ${lastName || ''}`),
                    usedSlugs
                );
                const archiveUrl = emptyToNull(user.blog_author_archive_url) || buildArchiveUrl(slug);

                const authorId = await insertAuthor(queryInterface, sequelize, {
                    user_id: user.id,
                    first_name: firstName,
                    last_name: lastName,
                    role: emptyToNull(user.blog_author_role),
                    bio: emptyToNull(user.blog_author_bio),
                    slug,
                    avatar_url: emptyToNull(user.profile_pic_url),
                    archive_url: archiveUrl,
                    team_url: emptyToNull(user.blog_author_team_url),
                    updated_by: null
                }, transaction);

                userToAuthorId.set(user.id, authorId);
            }

            let fallbackAuthorId = userToAuthorId.size > 0
                ? userToAuthorId.values().next().value
                : null;

            if (!fallbackAuthorId && blogs.length > 0) {
                const slug = uniqueSlug('unknown-author', usedSlugs);
                fallbackAuthorId = await insertAuthor(queryInterface, sequelize, {
                    user_id: null,
                    first_name: 'Unknown',
                    last_name: 'Author',
                    role: null,
                    bio: null,
                    slug,
                    avatar_url: null,
                    archive_url: buildArchiveUrl(slug),
                    team_url: null,
                    updated_by: null
                }, transaction);
            }

            for (const blog of blogs) {
                const override = parseOverride(blog.author_override);
                const user = usersById.get(blog.author_id) || null;

                if (hasOverrideContent(override)) {
                    const firstName = emptyToNull(override.first_name)
                        || emptyToNull(user?.first_name)
                        || 'Author';
                    const lastName = emptyToNull(override.last_name)
                        || emptyToNull(user?.last_name);
                    const slug = uniqueSlug(
                        slugify(`${firstName} ${lastName || ''}`),
                        usedSlugs
                    );
                    const archiveUrl = emptyToNull(override.archive_url)
                        || emptyToNull(user?.blog_author_archive_url)
                        || buildArchiveUrl(slug);

                    const authorId = await insertAuthor(queryInterface, sequelize, {
                        user_id: null,
                        first_name: firstName,
                        last_name: lastName,
                        role: emptyToNull(override.role) || emptyToNull(user?.blog_author_role),
                        bio: emptyToNull(override.bio) || emptyToNull(user?.blog_author_bio),
                        slug,
                        avatar_url: emptyToNull(override.avatar_url) || emptyToNull(user?.profile_pic_url),
                        archive_url: archiveUrl,
                        team_url: emptyToNull(override.team_url) || emptyToNull(user?.blog_author_team_url),
                        updated_by: blog.updated_by || null
                    }, transaction);

                    await sequelize.query(
                        'UPDATE blogs SET author_id = :authorId WHERE id = :id',
                        {
                            replacements: { authorId, id: blog.id },
                            transaction
                        }
                    );
                    continue;
                }

                const authorId = userToAuthorId.get(blog.author_id) || fallbackAuthorId;
                await sequelize.query(
                    'UPDATE blogs SET author_id = :authorId WHERE id = :id',
                    {
                        replacements: { authorId, id: blog.id },
                        transaction
                    }
                );
            }

            await queryInterface.addConstraint('blogs', {
                fields: ['author_id'],
                type: 'foreign key',
                name: 'blogs_author_id_authors_fk',
                references: {
                    table: 'authors',
                    field: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'RESTRICT',
                transaction
            });

            await queryInterface.removeColumn('blogs', 'author_override', { transaction });
        });
    },

    async down(queryInterface, Sequelize) {
        const sequelize = queryInterface.sequelize;

        await queryInterface.sequelize.transaction(async (transaction) => {
            await queryInterface.addColumn('blogs', 'author_override', {
                type: Sequelize.JSON,
                allowNull: true,
                comment: 'Optional per-post author display override (does not mutate users)'
            }, { transaction });

            const authors = await sequelize.query(
                `SELECT id, user_id, first_name, last_name, role, bio, avatar_url, archive_url, team_url
                 FROM authors`,
                { type: sequelize.QueryTypes.SELECT, transaction }
            );
            const authorsById = new Map(authors.map((author) => [author.id, author]));

            const fallbackUsers = await sequelize.query(
                'SELECT id FROM users ORDER BY id ASC LIMIT 1',
                { type: sequelize.QueryTypes.SELECT, transaction }
            );
            const fallbackUserId = fallbackUsers[0]?.id || null;

            const blogs = await sequelize.query(
                'SELECT id, author_id, updated_by FROM blogs',
                { type: sequelize.QueryTypes.SELECT, transaction }
            );

            await removeAuthorFk(queryInterface, transaction);

            for (const blog of blogs) {
                const author = authorsById.get(blog.author_id);
                const override = author
                    ? {
                        first_name: author.first_name,
                        last_name: author.last_name,
                        role: author.role,
                        bio: author.bio,
                        avatar_url: author.avatar_url,
                        archive_url: author.archive_url,
                        team_url: author.team_url
                    }
                    : null;
                const userId = author?.user_id || blog.updated_by || fallbackUserId;

                await sequelize.query(
                    'UPDATE blogs SET author_id = :userId, author_override = :override WHERE id = :id',
                    {
                        replacements: {
                            userId,
                            override: override ? JSON.stringify(override) : null,
                            id: blog.id
                        },
                        transaction
                    }
                );
            }

            await queryInterface.addConstraint('blogs', {
                fields: ['author_id'],
                type: 'foreign key',
                name: 'blogs_author_id_users_fk',
                references: {
                    table: 'users',
                    field: 'id'
                },
                onUpdate: 'CASCADE',
                onDelete: 'CASCADE',
                transaction
            });

            await queryInterface.dropTable('authors', { transaction });
        });
    }
};
