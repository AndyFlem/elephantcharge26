module.exports = function (eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ 'public': '.' });

  eleventyConfig.addFilter('km', (metres) => {
    if (metres == null) return '—';
    const km = metres / 1000;
    return (km < 0 ? km.toFixed(1) : km.toFixed(1)) + ' km';
  });

  eleventyConfig.addFilter('dollars', (value) => {
    if (value == null) return '—';
    return '$' + Math.round(value).toLocaleString('en-US');
  });

  eleventyConfig.addFilter('pct', (value) => {
    if (value == null) return '—';
    return Math.round(value * 100) + '%';
  });

  eleventyConfig.addFilter('number', (value) => {
    if (value == null) return '—';
    return Math.round(value).toLocaleString('en-US');
  });

  eleventyConfig.addFilter('year', (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).getFullYear();
  });

  eleventyConfig.addFilter('date', (dateStr) => {
    if (!dateStr) return '';
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric'
    });
  });

  return {
    dir: {
      input: 'site',
      output: '_site',
      includes: '_includes',
      data: '_data',
    },
    templateFormats: ['njk', 'html'],
    htmlTemplateEngine: 'njk',
  };
};
