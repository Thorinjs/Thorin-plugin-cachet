'use strict';
/**
 * API handling
 */
const qs = require('querystring');
module.exports = (thorin, opt) => {
  const fetch = thorin.util.fetch;
  let URL = `${opt.host}/api/v${opt.version}`;

  function doRequest(path, method, data) {
    const reqOpt = {
      method: method,
      timeout: 5000,
      headers: {
        'X-Cachet-Token': opt.key
      }
    };
    if (data && (method === 'POST' || method === 'PUT')) {
      reqOpt.headers['content-type'] = 'application/json';
      reqOpt.body = JSON.stringify(data);
    }
    if (path.charAt(0) !== '/') path = '/' + path;
    let url = URL + path;
    if (method === 'GET' && data) {
      let query = qs.stringify(data);
      if (query) {
        url += '?' + query;
      }
    }
    return fetch(url, reqOpt)
      .then((res) => res.json())
      .then((res) => {
        if (typeof res !== 'object' || !res) {
          return Promise.reject(thorin.error('CACHET.DATA', 'Cachet response is not valid', 400));
        }
        if (typeof res.errors !== 'undefined') {
          let err;
          if (res.errors instanceof Array) {
            err = res.errors[0];
          } else {
            return thorin.error('CACHET.DATA', 'An unexpected error occurred');
          }
          return thorin.error('CACHET.DATA', err.detail || 'An unexpected error occurred', err.status || 400);
        }
        return res.data;
      })
      .catch((e) => {
        if (e instanceof thorin.Error) return Promise.reject(e);
        return Promise.reject(thorin.error('CACHET.RESPONSE', 'Cachet server is currently unavailable', 400));
      });
  }

  return {
    $get: (path, data) => {
      return doRequest(path, 'GET', data);
    },
    $post: (path, data) => {
      return doRequest(path, 'POST', data);
    },
    $put: (path, data) => {
      return doRequest(path, 'PUT', data);
    }
  };
};