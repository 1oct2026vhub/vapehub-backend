const { errorResponse, successResponse } = require("../../../../utils/responseUtils");
const { Author, User, Blog } = require("../../../../models");
const { Op } = require("sequelize");
const { invalidateCachePattern } = require("../../../../library/cache");
const {
    slugifyAuthorName,
    emptyToNull,
    normalizeOptionalUserId,
    applyAuthorArchiveUrl,
    ensureUniqueAuthorSlug,
    uploadAuthorAvatar
} = require("../helper/blogAuthor.helper");

const AUTHOR_INCLUDES = [
    {
        model: User,
        as: 'user',
        attributes: ['id', 'first_name', 'last_name', 'email']
    },
    {
        model: User,
        as: 'updatedBy',
        attributes: ['id', 'first_name', 'last_name']
    }
];

const findAuthorById = (id, paranoid = true) => Author.findByPk(id, {
    paranoid,
    include: AUTHOR_INCLUDES
});

module.exports.listAllAuthors = async (req, res) => {
    try {
        let {
            page = 1,
            limit = 10,
            search,
            deleted = "false",
            sort = "first_name",
            order = "ASC"
        } = req.query;

        page = parseInt(page, 10);
        limit = parseInt(limit, 10);
        const offset = (page - 1) * limit;

        const allowedSortFields = ['first_name', 'last_name', 'slug', 'created_at', 'updated_at'];
        if (!allowedSortFields.includes(sort)) {
            sort = 'first_name';
        }

        order = String(order).toUpperCase();
        if (!['ASC', 'DESC'].includes(order)) {
            order = 'ASC';
        }

        const whereCondition = {};
        if (search) {
            whereCondition[Op.or] = [
                { first_name: { [Op.like]: `%${search}%` } },
                { last_name: { [Op.like]: `%${search}%` } },
                { slug: { [Op.like]: `%${search}%` } },
                { role: { [Op.like]: `%${search}%` } }
            ];
        }
        whereCondition.deleted_at = deleted === true || deleted === 'true'
            ? { [Op.ne]: null }
            : null;

        const { count, rows: authors } = await Author.findAndCountAll({
            where: whereCondition,
            limit,
            offset,
            order: [[sort, order]],
            paranoid: deleted !== true && deleted !== 'true',
            include: AUTHOR_INCLUDES
        });

        return successResponse(res, {
            total: count,
            page,
            limit,
            sort,
            order,
            authors
        }, "Authors retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.getAuthorById = async (req, res) => {
    try {
        const author = await findAuthorById(req.params.id, false);
        if (!author) {
            return errorResponse(res, { message: "Author not found" }, "Author not found", 404);
        }
        return successResponse(res, author, "Author retrieved successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.createAuthor = async (req, res) => {
    try {
        const {
            first_name,
            last_name,
            role,
            bio,
            slug: requestedSlug,
            archive_url,
            team_url,
            avatar_url
        } = req.body;
        const user_id = normalizeOptionalUserId(req.body.user_id);
        const updated_by = req.user.id;

        const slugBase = emptyToNull(requestedSlug) || slugifyAuthorName(first_name, last_name);
        const slug = await ensureUniqueAuthorSlug(slugBase);
        const avatarFileUrl = await uploadAuthorAvatar(req.file);

        const payload = {
            first_name: first_name.trim(),
            last_name: emptyToNull(last_name),
            role: emptyToNull(role),
            bio: emptyToNull(bio),
            slug,
            user_id,
            avatar_url: avatarFileUrl || emptyToNull(avatar_url),
            archive_url: emptyToNull(archive_url),
            team_url: emptyToNull(team_url),
            updated_by
        };
        applyAuthorArchiveUrl(payload);

        const created = await Author.create(payload);
        const author = await findAuthorById(created.id);

        invalidateCachePattern('blogs:*').catch(() => {});
        return successResponse(res, author, "Author created successfully", 201);
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.updateAuthor = async (req, res) => {
    try {
        const { id } = req.params;
        const author = await Author.findByPk(id);
        if (!author) {
            return errorResponse(res, { message: "Author not found" }, "Author not found", 404);
        }

        const payload = { updated_by: req.user.id };

        if (req.body.first_name !== undefined) {
            payload.first_name = req.body.first_name.trim();
        }
        if (req.body.last_name !== undefined) {
            payload.last_name = emptyToNull(req.body.last_name);
        }
        if (req.body.role !== undefined) {
            payload.role = emptyToNull(req.body.role);
        }
        if (req.body.bio !== undefined) {
            payload.bio = emptyToNull(req.body.bio);
        }
        if (req.body.user_id !== undefined) {
            payload.user_id = normalizeOptionalUserId(req.body.user_id);
        }
        if (req.body.archive_url !== undefined) {
            payload.archive_url = emptyToNull(req.body.archive_url);
        }
        if (req.body.team_url !== undefined) {
            payload.team_url = emptyToNull(req.body.team_url);
        }
        if (req.body.avatar_url !== undefined && !req.file) {
            payload.avatar_url = emptyToNull(req.body.avatar_url);
        }

        if (req.body.slug !== undefined) {
            const slugBase = emptyToNull(req.body.slug) || slugifyAuthorName(
                payload.first_name || author.first_name,
                payload.last_name !== undefined ? payload.last_name : author.last_name
            );
            payload.slug = await ensureUniqueAuthorSlug(slugBase, author.id);
        }

        const avatarFileUrl = await uploadAuthorAvatar(req.file);
        if (avatarFileUrl) {
            payload.avatar_url = avatarFileUrl;
        }

        applyAuthorArchiveUrl(payload, author);
        await author.update(payload);

        invalidateCachePattern('blogs:*').catch(() => {});
        const updated = await findAuthorById(author.id);
        return successResponse(res, updated, "Author updated successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.deleteAuthor = async (req, res) => {
    try {
        const { id } = req.params;
        const author = await Author.findByPk(id);
        if (!author) {
            return errorResponse(res, { message: "Author not found" }, "Author not found", 404);
        }

        const blogCount = await Blog.count({ where: { author_id: id } });
        if (blogCount > 0) {
            return errorResponse(
                res,
                { message: "Author is assigned to one or more blog posts" },
                "Reassign this author's posts before deleting",
                400
            );
        }

        if (req.user?.id) {
            await author.update({ updated_by: req.user.id });
        }
        await author.destroy();
        invalidateCachePattern('blogs:*').catch(() => {});
        return successResponse(res, {}, "Author deleted successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};

module.exports.restoreAuthor = async (req, res) => {
    try {
        const author = await Author.findOne({
            where: { id: req.params.id },
            paranoid: false
        });

        if (!author) {
            return errorResponse(res, { message: "Author not found" }, "Author not found", 404);
        }

        if (!author.deletedAt && !author.deleted_at) {
            return errorResponse(res, { message: "Author is not deleted" }, "Author is not deleted", 400);
        }

        await author.restore();
        invalidateCachePattern('blogs:*').catch(() => {});
        const restored = await findAuthorById(author.id);
        return successResponse(res, restored, "Author restored successfully");
    } catch (error) {
        return errorResponse(res, error, error.message);
    }
};
