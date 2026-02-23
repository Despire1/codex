module.exports = {
  apps: [
    {
      name: "api",
      script: "npm",
      args: "run api:prod",
    },
    {
      name: "bot",
      script: "npm",
      args: "run bot",
    },
  ],
};
