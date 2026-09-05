/**
 * Shared Leaflet helpers used by the charge map (site/charge/map.njk) and the
 * entry map (site/entry/index.njk) so both render checkpoints/leg popups the same way.
 */
window.ECMap = (function () {
  function formatKm(metres) {
    if (metres == null) return '—';
    return (metres / 1000).toFixed(1) + ' km';
  }

  function formatDuration(seconds) {
    if (seconds == null) return '—';
    var s = Math.round(seconds);
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var sec = s % 60;
    return [h, m, sec].map(function (v) { return String(v).padStart(2, '0'); }).join(':');
  }

  function addCheckpointMarkers(map, checkpoints, startCheckpointId) {
    (checkpoints || []).forEach(function (cp) {
      if (!cp.location) return;
      var lng = cp.location.coordinates[0], lat = cp.location.coordinates[1];
      var name = cp.short_name || cp.sponsor_name;
      var isStart = startCheckpointId != null && cp.checkpoint_id === startCheckpointId;

      L.circleMarker([lat, lng], {
        radius: isStart ? 8 : (cp.is_gauntlet ? 6 : 4),
        weight: isStart ? 3 : 1,
        color: isStart ? '#1e7a1e' : (cp.is_gauntlet ? '#c0392b' : '#333'),
        fillColor: isStart ? '#2ecc71' : (cp.is_gauntlet ? '#c0392b' : '#333'),
        fillOpacity: 0.9,
      })
        .bindTooltip(name, {
          permanent: true,
          direction: 'top',
          offset: [0, -4],
          className: isStart ? 'checkpoint-label checkpoint-label--start' : 'checkpoint-label',
        })
        .addTo(map);
    });
  }

  function addTsetseLines(map, checkpoints, legs) {
    var locationById = {};
    (checkpoints || []).forEach(function (cp) {
      if (cp.location) locationById[cp.checkpoint_id] = cp.location;
    });

    (legs || []).filter(function (l) { return l.is_tsetse; }).forEach(function (l) {
      var a = locationById[l.checkpoint1_id];
      var b = locationById[l.checkpoint2_id];
      if (!a || !b) return;

      L.polyline(
        [[a.coordinates[1], a.coordinates[0]], [b.coordinates[1], b.coordinates[0]]],
        { color: '#8e44ad', weight: 1.5, dashArray: '6,5', opacity: 0.8 }
      )
        .bindTooltip('Tsetse-line: ' + l.checkpoint1_name + ' – ' + l.checkpoint2_name)
        .addTo(map);
    });
  }

  function legPopupHtml(p) {
    var flags = [];
    if (p.is_gauntlet) flags.push('Gauntlet');
    if (p.is_tsetse) flags.push('Tsetse-line');

    return (
      '<div class="leg-popup">' +
      '<strong>' +
      '<span class="team-dot" style="background:' + (p.color || '#888') + '"></span>' +
      '<a href="/entry/' + p.entry_id + '/">Car ' + p.car_no + ' — ' + p.entry_name + '</a>' +
      '</strong><br>' +
      p.checkpoint1_name + ' → ' + p.checkpoint2_name + '<br>' +
      'Leg ' + p.leg_no + ' · ' + formatKm(p.distance_m) + ' · ' + formatDuration(p.elapsed_s) +
      (flags.length ? '<br><mark>' + flags.join(' / ') + '</mark>' : '') +
      '</div>'
    );
  }

  return {
    formatKm: formatKm,
    formatDuration: formatDuration,
    addCheckpointMarkers: addCheckpointMarkers,
    addTsetseLines: addTsetseLines,
    legPopupHtml: legPopupHtml,
  };
})();
