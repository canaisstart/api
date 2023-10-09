"use strict";

const { sanitizeEntity } = require("strapi-utils");
const orderTemplate = require("../../../config/email-templates/order");
const { default: axios } = require("axios");
const { formatData } = require("../../../config/functions/cart");

module.exports = {
  createPaymentIntent: async (ctx) => {
    const { cart } = ctx.request.body;

    // simplify cart data
    const cartCoursesIds = await strapi.config.functions.cart.cartCoursesIds(
      cart
    );

    // pega todos os cursos
    const courses = await strapi.config.functions.cart.cartItems(
      cartCoursesIds
    );

    console.log("courses", courses);

    if (!courses.length) {
      ctx.response.status = 404;
      return {
        error: "Nenhum curso vádlido encontrado!",
      };
    }
    const token = await strapi.plugins[
      "users-permissions"
    ].services.jwt.getToken(ctx);

    // pega o id do usuario
    const userId = token.id;

    // pegar as informações do usuário
    const userInfo = await strapi
      .query("user", "users-permissions")
      .findOne({ id: userId });

    const total = await strapi.config.functions.cart.total(courses);

    const entry = {
      user: userInfo,
      checkout_id: null,
      status: null,
      courses,
      total_in_cents: total,
      checkout_url: null,
    };

    if (total === 0) {
      entry.status = "paid";
    }

    const checkoutData = {
      items: courses
        .filter((course) => course.price > 0)
        .map((course) => ({
          name: course.name,
          amount: course.price * 100,
          quantity: 1,
          description: course.name,
          code: course.id,
        })),
      payments: [
        {
          payment_method: "checkout",
          checkout: {
            expires_in: 120,
            billing_address_editable: false,
            customer_editable: true,
            accepted_payment_methods: ["credit_card", "pix", "boleto"],
            success_url: "https://escolastart.plus/success",
            pix: {
              expires_in: 300,
            },
            credit_card: {
              capture: true,
              installments: [
                { number: 1, total },
                { number: 2, total },
                { number: 3, total },
                { number: 4, total },
                { number: 5, total },
                { number: 6, total },
              ],
            },
            boleto: {
              bank: "341",
              instructions: "Pagar até o vencimento",
              due_at: formatData(),
            },
          },
        },
      ],
      customer: {
        name: userInfo.username,
        code: userInfo.id,
      },
    };

    console.log(checkoutData.items);

    const config = {
      headers: {
        Authorization:
          "Basic " + Buffer.from(`${process.env.PAGARME_KEY}:`).toString("base64"),
        "Content-Type": "application/json",
      },
    };

    try {
      console.log("Teste1");
      if (total === 0) {
        entry.checkout_url = "https://escolastart.plus/success";
        entry.status = "paid";
      } else {
        const { data } = await axios.post(
          "https://api.pagar.me/core/v5/orders",
          checkoutData,
          config
        );
        console.log("Teste2");

        entry.checkout_id = data.id;
        entry.status = data.status;
        entry.checkout_url = data.checkouts[0].payment_url;
      }
      console.log("Teste3");

      await strapi.services.order.create(entry);
      ctx.response.status = 201;
      return { payment_url: entry.checkout_url };
    } catch (err) {
      ctx.response.status = 500;
      return { error: err.message };
    }
  },

  webhook: async (ctx) => {
    const { data } = ctx.request.body;

    try {
      const order = await strapi.services.order.findOne({
        checkout_id: data.order.id,
      });

      await strapi.services.order.update(
        { id: order.id },
        { ...order, status: data.status }
      );
    } catch (err) {
      console.log(err.response.data.errors);
      ctx.response.status = 500;
      return { error: err.message };
    }
    ctx.response.status = 204;
    return {};
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
    const cartCoursesIds = await strapi.config.functions.cart.cartCoursesIds(
      cart
    );

    // pegar os cursos
    const courses = await strapi.config.functions.cart.cartItems(
      cartCoursesIds
    );

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

    const valorTotal = new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: "BRL",
    }).format(total_in_cents / 100);

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
