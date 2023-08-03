"use strict";
const { sanitizeEntity } = require("strapi-utils");

module.exports = {
  async create(ctx) {
    const token = await strapi.plugins[
      "users-permissions"
    ].services.jwt.getToken(ctx);

    console.log(token.id);
    const body = {
      ...ctx.request.body,
      user: token.id,
    };

    const entity = await strapi.services["users-lessons"].create(body);
    return sanitizeEntity(entity, { model: strapi.models["users-lessons"] });
  },
};
