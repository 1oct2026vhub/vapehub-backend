const formatCategoryRefs = (categories = []) => (
    categories.map((category) => {
        const categoryData = category.toJSON ? category.toJSON() : category;
        return {
            id: categoryData.id,
            name: categoryData.name,
            slug: categoryData.slug
        };
    })
);

const formatAdminBuyingGuide = (guideInstance) => {
    if (!guideInstance) {
        return null;
    }

    const guide = guideInstance.toJSON ? guideInstance.toJSON() : guideInstance;
    const highlights = (guide.highlights || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((item) => ({ text: item.text }));

    const tabs = (guide.tabs || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((tab) => ({
            tab_title: tab.tab_title,
            section_heading: tab.section_heading,
            section_body: tab.section_body,
            order: tab.sort_order
        }));

    const related_blog_ids = (guide.relatedBlogs || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((relation) => relation.related_blog_id);

    const related_blogs = (guide.relatedBlogs || [])
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((relation) => {
            const blog = relation.relatedBlog;
            if (!blog) {
                return null;
            }
            const data = blog.toJSON ? blog.toJSON() : blog;
            return {
                id: data.id,
                title: data.title,
                slug: data.slug,
                image_url: data.image_url,
                alt_text: data.alt_text,
                status: data.status,
                published_at: data.published_at,
                categories: formatCategoryRefs(data.categories)
            };
        })
        .filter(Boolean);

    const formatted = {
        id: guide.id,
        is_enabled: guide.is_enabled,
        guide_label: guide.guide_label || '',
        title: guide.title || '',
        intro_content: guide.intro_content || '',
        banner_image: guide.banner_image,
        banner_alt: guide.banner_alt || '',
        highlights,
        tabs,
        related_blog_ids,
        related_blogs
    };

    if (guide.category_id != null) {
        formatted.category_id = guide.category_id;
    }
    if (guide.brand_id != null) {
        formatted.brand_id = guide.brand_id;
    }

    return formatted;
};

const formatPublicBuyingGuide = (guideInstance) => {
    const adminShape = formatAdminBuyingGuide(guideInstance);
    if (!adminShape || !adminShape.is_enabled) {
        return null;
    }

    const related_guides = (adminShape.related_blogs || [])
        .filter((blog) => blog.status === 'published')
        .map((blog) => ({
            id: blog.id,
            title: blog.title,
            slug: blog.slug,
            image_url: blog.image_url,
            alt_text: blog.alt_text,
            published_at: blog.published_at,
            categories: blog.categories || []
        }));

    const {
        id: _id,
        category_id: _categoryId,
        brand_id: _brandId,
        related_blog_ids: _relatedBlogIds,
        related_blogs: _relatedBlogs,
        ...publicFields
    } = adminShape;

    return {
        ...publicFields,
        related_guides
    };
};

module.exports = {
    formatAdminBuyingGuide,
    formatPublicBuyingGuide
};
