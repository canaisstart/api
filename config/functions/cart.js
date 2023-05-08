const cartCoursesIds = async (cart) => {
  return await cart.map((course) => ({
    id: course.id,
  }));
};

const cartItems = async (cart) => {
  let courses = [];

  await Promise.all(
    cart?.map(async (course) => {
      const validatedCourse = await strapi.services.course.findOne({
        id: course.id,
      });

      if (validatedCourse) {
        courses.push(validatedCourse);
      }
    })
  );

  return courses;
};

const total = async (courses) => {
  const amount = await courses.reduce((acc, course) => {
    return acc + course.price;
  }, 0);

  return Number((amount * 100).toFixed(0));
};

module.exports = {
  cartCoursesIds,
  cartItems,
  total,
};
