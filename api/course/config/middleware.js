module.exports = {
  settings: {
    parser: {
      enabled: true,
      multipart: true,
      formidable: {
        maxFileSize: 500 * 1024 * 1024
      },
    },
  },
};
