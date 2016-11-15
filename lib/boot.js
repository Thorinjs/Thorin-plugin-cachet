'use strict';
/**
 * Boots up and performs component/group checks.
 */
module.exports = (thorin, opt, api, ensure) => {
  let calls = [],
    status = require('./status');


  /* Step one: check if we have a group, and create it. */
  if (opt.component.group) {
    calls.push(() => {
      return ensure.group(opt.component.group).then((id) => {
        opt.component.group_id = id;
      });
    });
  }

  /* Check if the component exists */
  calls.push(() => {
    return ensure.component(opt.component).then((id) => {
      opt.component.id = id;
    });
  });

  /* IF we have metrics enabled, check if we have to create. */
  if (opt.metrics) {
    Object.keys(opt.metrics).forEach((suffix) => {
      let metric = opt.metrics[suffix];
      calls.push(() => {
        return ensure.metric(suffix, metric).then((id) => {
          opt.metrics[suffix].id = id;
        });
      });
    });
  }
  return thorin.series(calls);
};
