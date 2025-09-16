// craco.config.js
module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      const existing = webpackConfig.ignoreWarnings || [];
      const cocoPattern = /node_modules[\\\/]@tensorflow-models[\\\/]coco-ssd[\\\/].*\.js/;
      webpackConfig.ignoreWarnings = [
        ...existing,
        { module: cocoPattern }
      ];
      return webpackConfig;
    }
  }
};
