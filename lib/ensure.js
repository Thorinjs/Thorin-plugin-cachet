'use strict';
/**
 * Ensures that the component exists.
 */
const status = require('./status');
module.exports = (thorin, opt, api) => {
  let logger = thorin.logger(opt.logger);
  return {
    group: (group) => {
      let calls = [],
        groupId = null;
      calls.push(() => {
        return api.$get('/components/groups', {
          per_page: 100
        }).then((data) => {
          for (let i = 0; i < data.length; i++) {
            if (data[i].name == group) {
              groupId = data[i].id;
              break;
            }
          }
        });
      });
      /* check if we have to create group */
      calls.push(() => {
        if (groupId) return;
        return api.$post('/components/groups', {
          name: group
        }).then((grp) => {
          groupId = grp.id;
          logger.trace(`Created group: ${groupId}`);
        });
      });
      return thorin.series(calls).then(() => groupId);
    },
    component: (component) => {
      let calls = [],
        compId = null;
      calls.push(() => {
        return api.$get('/components', {
          per_page: 100
        }).then((data) => {
          for (let i = 0; i < data.length; i++) {
            let item = data[i];
            if (item.name == component.name) {
              compId = item.id;
              break;
            }
          }
        });
      });

      /* check if we have to create it */
      calls.push(() => {
        if (compId) return;
        let d = {
          name: component.name,
          status: status.OPERATIONAL
        };
        if (component.group_id) {
          d.group_id = component.group_id;
        }
        if (component.link) {
          d.link = component.link;
        }
        if (component.description) {
          d.description = component.description;
        }
        return api.$post('/components', d).then((res) => {
          compId = res.id;
          logger.trace(`Created component: ${compId}`);
        });
      });
      return thorin.series(calls).then(() => compId);
    },
    metric: (suffix, metric) => {
      let calls = [],
        metricId = null;

      calls.push(() => {
        return api.$get('/metrics', {
          per_page: 100
        }).then((data) => {
          for (let i = 0; i < data.length; i++) {
            let item = data[i];
            if (item.suffix == suffix) {
              metricId = item.id;
              break;
            }
          }
        });
      });
      calls.push(() => {
        if (metricId) return;
        let d = {
          name: metric.name || suffix,
          suffix: suffix,
          description: metric.description || '-',
          default_value: (typeof metric.default === 'undefined' ? 0 : metric.default),
          places: (typeof metric.places === 'undefined' ? 0 : metric.places)
        };
        if (metric.display == false) {
          d.display_chart = 0;
        } else {
          d.display_chart = 1;
        }
        if (metric.type === 'avg') {
          d.calc_type = 1;  // avg
        } else {
          d.calc_type = 0;    // sum
        }
        if (metric.threshold) {
          d.threshold = metric.threshold;
        } else {
          d.threshold = 1; // 1 minute threshold
        }
        return api.$post('/metrics', d).then((res) => {
          metricId = res.id;
          logger.trace(`Created metric: ${metricId}`);
        });
      });
      return thorin.series(calls).then(() => metricId);
    },

    /*
     * Checks if incident exists
     * */
    incidentExists(incident) {
      return api.$get('/incidents', {
        per_page: 100
      }).then((data) => {
        for (let i = data.length - 1; i >= 0; i--) {
          let item = data[i];
          if (incident.name !== item.name) continue;
          if (incident.message != item.message) continue;
          if (incident.component_id != item.component_id) continue;
          if (incident.status != item.status) continue;
          return item;
        }
        return null;
      });
    }
  }
};