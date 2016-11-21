'use strict';
const initApi = require('./lib/api'),
  initBoot = require('./lib/boot'),
  initEnsure = require('./lib/ensure'),
  status = require('./lib/status');
module.exports = function (thorin, opt, pluginName) {
  const defaultOpt = {
    logger: pluginName || 'cachet',
    host: null,
    key: process.env.CACHET_KEY || "",
    version: "1",
    // This is the component definition.
    component: {
      name: thorin.app,
      description: '',
      group: null,  // if set to string, we will make sure the group with that name exists.
      tag: thorin.app
    },
    // This is the metrics section, where we update metrics. Set this to false to disable completely.
    // Default metric data:
    //        array of:
    //          -> id -> the metric id
    //          -> key -> the metric suffix
    //          -> name -> the metric public name
    //          -> description -> the public description
    //          -> default -> the default value
    //          -> type=avg/sum -> the metric type, default sum
    //          -> threshold -> the number of minutes between metric points, default 1
    //          -> places -> the number of decimal places
    metrics: []
  };

  opt = thorin.util.extend(defaultOpt, opt);
  let logger = thorin.logger(opt.logger);
  /**
   * Ensures that the thorin app component exists.
   * */

  let pluginObj = {},
    api = initApi(thorin, opt),
    ensure = initEnsure(thorin, opt, api);

  /*
   * Initiate the plugin by checking if we have to create any component/groups.
   * This is asynchronous.
   * */
  pluginObj.run = (done) => {
    initBoot(thorin, opt, api, ensure).catch((e) => {
      logger.warn(`Could not complete cachet initialization process`);
      logger.debug(e);
    }).finally(() => {
      done();
    });
  };

  /**
   * Posts a new metric to cachet.
   * First: check if the metric exists. If not create it
   * */
  pluginObj.metric = (metric, value) => {
    let calls = [],
      metricId;
    if (typeof metric === 'object' && metric) {
      calls.push(() => {
        return ensure.metric(metric.suffix, metric).then((id) => {
          metricId = id;
        });
      });
    } else {
      metricId = metric;
      if(typeof metricId === 'string' && opt.metrics instanceof Array) {
        for(let i=0; i < opt.metrics.length; i++) {
          if(opt.metrics[i].name == metricId) {
            metricId = opt.metrics[i].id;
          }
        }
      }
    }
    calls.push(() => {
      // send metric.
      return api.$post(`/metrics/${metricId}/points`, {
        value: value
      });
    });

    return thorin.series(calls);
  };

  /**
   * Creates an incident that affected this node.
   * */
  pluginObj.createIncident = (name, message, data) => {
    let calls = [],
      incident;
    if (typeof data !== 'object' || !data) data = {};
    let payload = {
      name: name,
      message: message,
      visible: (typeof data.visible === 'undefined' ? 1 : data.visible),
      status: 1,  // Investigating
      component_status: status.PERFORMANCE,
      notify: (typeof data.notify === 'undefined' ? false : data.notify)
    };
    if (typeof data.component_id !== 'undefined') {
      payload.component_id = data.component_id;
    }
    if (typeof data.component_status !== 'undefined') {
      payload.component_status = data.component_status;
    }

    /* check if incident exists */
    calls.push(() => {
      return ensure.incidentExists(payload).then((iObj) => {
        incident = iObj;
      });
    });

    /* check if we have to create */
    calls.push(() => {
      if (incident) return;
      return api.$post('/incidents', payload).then((r) => {
        incident = r;
      });
    });
    return thorin.series(calls).then(() => incident);
  };

  /**
   * Marks the component as operational again, closing any
   * incident.
   * */
  pluginObj.setOperational = (component) => {
    let calls = [],
      incident = null,
      componentId;
    calls.push(() => {
      return ensure.component(component || opt.component).then((id) => componentId = id);
    });
    calls.push(() => {
      return api.$put(`/components/${componentId}`, {
        status: status.OPERATIONAL
      });
    });
    /* return last 5 incidents for this component and update their status to ok */
    calls.push(() => {
      return api.$get('/incidents', {
        component_id: componentId,
        per_page: 5
      }).then((data) => {
        let updates = [];
        data.forEach((incident) => {
          updates.push(() => {
            return api.$put(`/incidents/${incident.id}`, {
              status: 4
            });
          });
        });
        return thorin.series(updates);
      });
    });
    return thorin.series(calls).then(() => incident);
  };

  /**
   * Reports a minor incident for the current component
   * This will essentially create a performance issue incident.
   * NOTE: if called with name,message, we will also create an incident.
   * */
  pluginObj.setLatency = (name, message, data) => {
    let calls = [],
      incident = null,
      componentId;
    let component = (typeof name === 'object' && name) ? name : opt.component;
    calls.push(() => {
      return ensure.component(component).then((id) => componentId = id);
    });

    /* check if we create incident or just update */
    if (typeof name === 'string') {
      calls.push(() => {
        if (typeof data !== 'object' || !data) data = {};
        data.component_id = componentId;
        data.component_status = status.PERFORMANCE;
        return pluginObj.createIncident(name, message, data);
      });
    } else {
      /* update */
      calls.push(() => {
        return api.$put(`/components/${componentId}`, {
          status: status.PERFORMANCE
        });
      });
    }
    return thorin.series(calls).then(() => incident);
  };

  /**
   * Reports a minor/partial outage for the current component.
   * This will essentially create a minor outage incident.
   * */
  pluginObj.setMinor = (name, message, data) => {
    let calls = [],
      incident = null,
      componentId;
    let component = (typeof name === 'object' && name) ? name : opt.component;
    calls.push(() => {
      return ensure.component(component).then((id) => componentId = id);
    });

    /* check if we create incident or just update */
    if (typeof name === 'string') {
      calls.push(() => {
        if (typeof data !== 'object' || !data) data = {};
        data.component_id = componentId;
        data.component_status = status.MINOR_OUTAGE;
        return pluginObj.createIncident(name, message, data);
      });
    } else {
      /* update */
      calls.push(() => {
        return api.$put(`/components/${componentId}`, {
          status: status.MINOR_OUTAGE
        });
      });
    }
    return thorin.series(calls).then(() => incident);
  };

  /**
   * Reports a major outage for the current component.
   * */
  pluginObj.setMajor = (name, message, data) => {
    let calls = [],
      incident = null,
      componentId;
    let component = (typeof name === 'object' && name) ? name : opt.component;
    calls.push(() => {
      return ensure.component(component).then((id) => componentId = id);
    });

    /* check if we create incident or just update */
    if (typeof name === 'string') {
      calls.push(() => {
        if (typeof data !== 'object' || !data) data = {};
        data.component_id = componentId;
        data.component_status = status.MAJOR_OUTAGE;
        return pluginObj.createIncident(name, message, data);
      });
    } else {
      /* update */
      calls.push(() => {
        return api.$put(`/components/${componentId}`, {
          status: status.MAJOR_OUTAGE
        });
      });
    }
    return thorin.series(calls).then(() => incident);
  };


  return pluginObj;
};
module.exports.publicName = 'cachet';