module.exports = {
  root: true,
  env: {
    node: true,
  },
  extends: [
    'plugin:vue/vue3-essential',
    'eslint:recommended',
  ],
  "rules": {
    "vue/no-unused-vars": ["error", {
      "ignorePattern": "^_"
    }]
  },  
}
