"use strict";

const stripe = require("stripe")(process.env.STRIPE_KEY);
const { sanitizeEntity } = require("strapi-utils");
const orderTemplate = require("../../../config/email-templates/order");

module.exports = {
  createPaymentIntent: async (ctx) => {
    const { cart } = ctx.request.body;

    // simplify cart data
    const cartCoursesIds = await strapi.config.functions.cart.cartCoursesIds(cart);

    // get all courses
    const courses = await strapi.config.functions.cart.cartItems(cartCoursesIds);

    if (!courses.length) {
      ctx.response.status = 404;
      return {
        error: "Nenhum curso vádlido encontrado!",
      };
    }

    const total = await strapi.config.functions.cart.total(courses);

    if (total === 0) {
      return {
        freeCourses: true,
      };
    }

    try {
      const paymentIntent = await stripe.paymentIntents.create({
        amount: total,
        currency: "brl",
        payment_method_types: ['card','boleto'],
        metadata: { cart: JSON.stringify(cartCoursesIds) },
      });

      return paymentIntent;
    } catch (err) {
      return {
        error: err.raw.message,
      };
    }
  },

  create: async (ctx) => {
    // pegar as informações do frontend
    const { cart, paymentIntentId, paymentMethod } = ctx.request.body;

    // pega o token
    const token = await strapi.plugins[
      "users-permissions"
    ].services.jwt.getToken(ctx);

    // pega o id do usuario
    const userId = token.id;

    // pegar as informações do usuário
    const userInfo = await strapi
      .query("user", "users-permissions")
      .findOne({ id: userId });

    // simplify cart data
    const cartCoursesIds = await strapi.config.functions.cart.cartCoursesIds(cart);

    // pegar os cursos
    const courses = await strapi.config.functions.cart.cartItems(cartCoursesIds);

    // pegar o total (saber se é free ou não)
    const total_in_cents = await strapi.config.functions.cart.total(courses);

    // precisa pegar do frontend os valores do paymentMethod
    // e recuperar por aqui
    let paymentInfo;
    if (total_in_cents !== 0) {
      try {
        paymentInfo = await stripe.paymentMethods.retrieve(paymentMethod);
      } catch (err) {
        ctx.response.status = 402;
        return { error: err.message };
      }
    }

    // salvar no banco
    const entry = {
      total_in_cents,
      payment_intent_id: paymentIntentId,
      card_brand: paymentInfo?.card?.brand,
      card_last4: paymentInfo?.card?.last4,
      user: userInfo,
      courses,
    };

    const entity = await strapi.services.order.create(entry);

    const valorTotal = new Intl.NumberFormat('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    }).format(total_in_cents / 100)

    // enviar um email da compra para o usuário com Email Designer
    await strapi.plugins["email-designer"].services.email.sendTemplatedEmail(
      {
        to: userInfo.email,
        from: "no-reply@escolastart.plus",
      },
      {
        templateId: 1,
      },
      {
        user: userInfo,
        payment: {
          total: valorTotal,
          card_brand: entry.card_brand,
          card_last4: entry.card_last4,
        },
        courses,
      }
    );

    // enviar email usando o template default
    // await strapi.plugins.email.services.email.sendTemplatedEmail(
    //   {
    //     to: userInfo.email,
    //     from: "no-reply@portalescolastart.com",
    //   },
    //   orderTemplate,
    //   {
    //     user: userInfo,
    //     payment: {
    //       total: valorTotal,
    //       card_brand: entry.card_brand,
    //       card_last4: entry.card_last4,
    //     },
    //     courses,
    //   }
    // );

    // retornando que foi salvo no banco
    return sanitizeEntity(entity, { model: strapi.models.order });
  },
};
