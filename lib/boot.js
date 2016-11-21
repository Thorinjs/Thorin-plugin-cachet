'use strict';
/**
 * Boots up and performs component/group checks.
 */
module.exports = (thorin, opt, api, ensure) => {
  let calls = [],
    status = require('./status');

  function ensureComponent(component) {
    if (component.group) {
      calls.push(() => {
        return ensure.group(component.group).then((id) => {
          component.group_id = id;
        });
      });
    }
    /* Check if the component exists */
    calls.push(() => {
      return ensure.component(component).then((id) => {
        component.id = id;
      });
    });
  }

  /* Step one: check if we have a group, and create it. */
  if (opt.component) {
    ensureComponent(opt.component);
  }
  if (opt.components instanceof Array && opt.components.length > 0) {
    for (let i = 0; i < opt.components.length; i++) {
      ensureComponent(opt.components[i]);
    }
  }

  /* IF we have metrics enabled, check if we have to create. */
  if (opt.metrics instanceof Array) {
    opt.metrics.forEach((metric) => {
      let name = metric.name;
      calls.push(() => {
        return ensure.metric(name, metric).then((id) => {
          metric.id = id;
        });
      });
    });
  }
  return thorin.series(calls);
};
