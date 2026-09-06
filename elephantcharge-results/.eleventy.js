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

  eleventyConfig.addFilter('time', (dateStr) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleTimeString('en-GB', {
      hour: '2-digit', minute: '2-digit'
    });
  });

  eleventyConfig.addFilter('duration', (seconds) => {
    if (seconds == null) return '—';
    const s = Math.round(seconds);
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return [h, m, sec].map((v) => String(v).padStart(2, '0')).join(':');
  });

  eleventyConfig.addFilter('speed', (value) => {
    if (value == null) return '—';
    return value.toFixed(1) + ' km/h';
  });

  eleventyConfig.addFilter('multiple', (value) => {
    if (value == null) return '—';
    return (value < 1 ? 1 : value).toFixed(2) + '×';
  });

  eleventyConfig.addFilter('json', (value) => JSON.stringify(value));

  // Nunjucks' selectattr() only checks truthiness of the named attribute — it
  // ignores any test name ('equalto') and comparison value passed to it, unlike
  // Jinja2's selectattr. Use this instead for an actual equality lookup.
  eleventyConfig.addFilter('find', (arr, key, value) => (arr || []).find((item) => item[key] === value) || null);

  eleventyConfig.addFilter('sortDesc', (arr, attribute) => {
    return [...arr].sort((a, b) => {
      const av = a[attribute];
      const bv = b[attribute];
      if (av == null && bv == null) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      return bv - av;
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
