"use strict";

/**
 * Read the documentation (https://strapi.io/documentation/developer-docs/latest/development/backend-customization.html#core-controllers)
 * to customize this controller
 */

module.exports = {
  createUserProgress: async (ctx) => {
    const { courseId, curriculumId, contentId } = ctx.params;

    const token = await strapi.plugins[
      "users-permissions"
    ].services.jwt.getToken(ctx);
    console.log(token)
    // pega o id do usuario
    const userId = token.id;

    const userInfo = await strapi
      .query("user", "users-permissions")
      .findOne({ id: userId });

    try {
      const course = await strapi.query("course").findOne({ id: courseId });
      console.log(course.curriculum[0].content[0].users_permissions_users);
      const entry = {
        ...course,
        curriculum: course.curriculum.map((curriculum) => {
          if (curriculum.id == curriculumId) {
            const content = curriculum.content.map((content) => {
              if (content.id == contentId) {
                return {
                  ...content,
                  users_permissions_users: [
                    ...content.users_permissions_users,
                    { ...userInfo },
                  ],
                };
              }
              return content;
            });
            return { ...curriculum, content };
          }
          return curriculum;
        }),
      };
      await strapi.services.course.update({ id: courseId }, entry);
      ctx.response.status = 204;
      return { status: "success" };
    } catch (err) {
      ctx.response.status = 500;
      return { error: err.message };
    }
  },

  deleteUserProgress: async (ctx) => {
    const { courseId, curriculumId, contentId } = ctx.params;
    console.log(courseId, curriculumId, contentId);

    const token = await strapi.plugins[
      "users-permissions"
    ].services.jwt.getToken(ctx);

    // pega o id do usuario
    const userId = token.id;

    const userInfo = await strapi
      .query("user", "users-permissions")
      .findOne({ id: userId });

    try {
      const course = await strapi.query("course").findOne({ id: courseId });
      console.log(course.curriculum[0].content[0].users_permissions_users);
      const entry = {
        ...course,
        curriculum: course.curriculum.map((curriculum) => {
          if (curriculum.id == curriculumId) {
            const content = curriculum.content.map((content) => {
              if (content.id == contentId) {
                return {
                  ...content,
                  users_permissions_users:
                    content.users_permissions_users.filter(
                      (user) => userId != user.id
                    ),
                };
              }
              return content;
            });
            return { ...curriculum, content };
          }
          return curriculum;
        }),
      };
      await strapi.services.course.update({ id: courseId }, entry);
      ctx.response.status = 204;
      return { status: "success" };
    } catch (err) {
      ctx.response.status = 500;
      return { error: err.message };
    }
  },
};
