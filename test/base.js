/* eslint-env mocha */

import { expect } from 'chai';
import nock from 'nock';
import { all } from 'bluebird';
import merge from 'lodash/object/merge';
import sdktor from '../src';

const HOST = 'tests.com';
const ROOT_URI = `https://${HOST}/api/v1/`;
const AUTH = `Basic ${new Buffer('user:pass').toString('base64')}`;
const BASE_HEADERS = {
  accept: 'application/json',
  authorization: AUTH,
  host: 'tests.com',
  'accept-encoding': 'gzip, deflate',
  'user-agent': 'sdktor/1.0',
};

const mockRoot = nock(ROOT_URI);
const sdk = sdktor(ROOT_URI, BASE_HEADERS, {
  postRequest: [r => r],
});

const ensureNoPendingRequests = () => {
  if (!mockRoot.isDone()) {
    throw new Error(`Requests pending: ${mockRoot.pendingMocks()}`);
  }
};

describe('HTTP Verbs', () => {
  before(() => {
    mockRoot
      .get('/service/').reply(200, { payload: 'OK' })
      .post('/service/').reply(201, { name: 'test', ok: true })
      .patch('/service/uuid/').reply(200, { name: 'test2' })
      .put('/service/uuid/').reply(200, { name: 'test2', ok: true })
      .delete('/service/uuid/').reply(200, { name: 'test2', ok: true });
  });

  it('get()', (done) => {
    const get = sdk.get('service/');

    get().then((data) => {
      expect(`${ROOT_URI}service/`).to.equal(data.request.url);
      expect(data.body.payload).to.equal('OK');
      done();
    })
    .catch(done);
  });

  it('post()', (done) => {
    const post = sdk.post('service/');

    post()
      .then((data) => {
        expect(`${ROOT_URI}service/`).to.equal(data.request.url);
        expect(data.body.name).to.equal('test');
        expect(data.body.ok).to.equal(true);
        done();
      })
      .catch(done);
  });

  it('patch()', (done) => {
    const patch = sdk.patch('service/uuid/');

    patch()
      .then((data) => {
        expect(`${ROOT_URI}service/uuid/`).to.equal(data.request.url);
        expect(data.body.name).to.equal('test2');
        done();
      })
      .catch(done);
  });

  it('put()', (done) => {
    const put = sdk.put('service/uuid/');
    put()
      .then((data) => {
        expect(`${ROOT_URI}service/uuid/`).to.equal(data.request.url);
        expect(data.body.name).to.equal('test2');
        done();
      })
      .catch(done);
  });

  it('del()', (done) => {
    const del = sdk.del('service/uuid/');
    del()
      .then((data) => {
        expect(`${ROOT_URI}service/uuid/`).to.equal(data.request.url);
        expect(data.body.name).to.equal('test2');
        expect(data.body.ok).to.equal(true);
        done();
      })
      .catch(done);
  });

  after(ensureNoPendingRequests);
});

describe('Recursive routes', () => {
  it('at() should allow for nested routes', () => {
    const root = sdk.at('service/');
    const leaf1 = root.at('list/');
    const leaf2 = leaf1.at('item/');
    const leaf3 = leaf2.at('uuid/');
    const leaf3b = leaf2.at('other/');

    [root, leaf1, leaf2, leaf3, leaf3b].forEach((route) => {
      expect(route.at).to.be.a('function');
      expect(route.get).to.be.a('function');
      expect(route.post).to.be.a('function');
      expect(route.patch).to.be.a('function');
      expect(route.put).to.be.a('function');
      expect(route.del).to.be.a('function');
      expect(route.url).to.be.a('function');
    });
    expect(root.url()).to.equal(`${ROOT_URI}service/`);
    expect(leaf1.url()).to.equal(`${ROOT_URI}service/list/`);
    expect(leaf2.url()).to.equal(`${ROOT_URI}service/list/item/`);
    expect(leaf3.url()).to.equal(`${ROOT_URI}service/list/item/uuid/`);
    expect(leaf3b.url()).to.equal(`${ROOT_URI}service/list/item/other/`);
  });

  it('should call the correct endpoint', done => {
    mockRoot
      .get('/service/').reply(200, { ok: 'OK1' })
      .get('/service/item/').reply(200, { ok: 'OK2' })
      .post('/service/item/').reply(200, { ok: 'OK3' })
      .patch('/service/item/').reply(200, { ok: 'OK4' })
      .put('/service/item/').reply(200, { ok: 'OK5' })
      .delete('/service/item/').reply(200, { ok: 'OK6' })
      .get('/service/item/meta/').reply(200, { ok: 'OK7' })
      .get('/service/item/children/').reply(200, { ok: 'OK8' })
      .post('/service/item/children/').reply(200, { ok: 'OK9' })
      .get('/service/item/children/info/').reply(200, { ok: 'OK10' });

    const service = sdk.at('service/');
    const serviceItem = service.at('item/');
    const serviceChildren = serviceItem.at('children/');

    const getServices = service.get()();
    const getService = serviceItem.get()();
    const createService = serviceItem.post()();
    const patchService = serviceItem.patch()();
    const updateService = serviceItem.put()();
    const deleteService = serviceItem.del()();
    const getServiceMeta = serviceItem.get('meta/')();
    const getServiceChildren = serviceChildren.get()();
    const createServiceChildren = serviceChildren.post()();
    const getServiceChildrenInfo = serviceChildren.get('info/')();

    const assertPromise = n => data => {
      expect(data.status).to.equal(200);
      expect(data.body.ok).to.equal(`OK${n}`);
    };

    all([
      getServices.then(assertPromise(1)),
      getService.then(assertPromise(2)),
      createService.then(assertPromise(3)),
      patchService.then(assertPromise(4)),
      updateService.then(assertPromise(5)),
      deleteService.then(assertPromise(6)),
      getServiceMeta.then(assertPromise(7)),
      getServiceChildren.then(assertPromise(8)),
      createServiceChildren.then(assertPromise(9)),
      getServiceChildrenInfo.then(assertPromise(10)),
    ]).then(() => done())
      .catch(done);
  });

  after(ensureNoPendingRequests);
});

describe('Parameterization', () => {
  before(() => {
    mockRoot.get('/service/qwerty/').reply(200, { payload: 'OK' });
    mockRoot.post('/service/id_qwerty/v1/extra/').reply(200, { payload: 'OK' });
    mockRoot.post('/service/id_qwerty/v2.5/').reply(200, { payload: 'OK' });
    mockRoot.patch('/service/qwerty/more-data/progfun/').reply(200, { payload: 'OK' });
    mockRoot.get('/service/id/').reply(204);
  });

  it('replace route parameters', (done) => {
    const get = sdk.get('service/:uuid/');
    get({ uuid: 'qwerty' })
      .then(data => {
        expect(`${ROOT_URI}service/qwerty/`).to.equal(data.request.url);
        expect(data.body.payload).to.equal('OK');
        done();
      });
  });

  it('replace route parameters with complex regexp', done => {
    const post = sdk.post('service/id_:uuid/v:major(.:minor)/(*/)');

    const promises = [
      post({ uuid: 'qwerty', major: 1, _: 'extra' }).then(data => {
        expect(`${ROOT_URI}service/id_qwerty/v1/extra/`).to.equal(data.request.url);
        expect(data.body.payload).to.equal('OK');
      }),
      post({ uuid: 'qwerty', major: 2, minor: 5 }).then(data => {
        expect(`${ROOT_URI}service/id_qwerty/v2.5/`).to.equal(data.request.url);
        expect(data.body.payload).to.equal('OK');
      }),
    ];

    all(promises)
      .then(() => done())
      .catch(done);
  });

  it('should throw an error if a required param is not provided', done => {
    const get = sdk.get('service/:uuid/(:type/)');

    get().catch(err => {
      expect(err.message).to.equal('no values provided for key `uuid`');
      get({ type: 'indiferent' }).catch(err2 => {
        expect(err2.message).to.equal('no values provided for key `uuid`');
        get({ uuid: 'id' }).then(() => {
          done();
        }).catch(done);
      });
    });
  });

  it('should resolve recursive routes params', (done) => {
    const service = sdk.at('service/');
    const item = service.at(':uuid/');
    const patch = item.patch('more-data/:type/');

    patch({ uuid: 'qwerty', type: 'progfun' }).then(data => {
      expect(`${ROOT_URI}service/qwerty/more-data/progfun/`).to.equal(data.request.url);
      expect(data.body.payload).to.equal('OK');
      done();
    });
  });

  after(ensureNoPendingRequests);
});

describe('Request Data', () => {
  before(() => {
    mockRoot
      .get('/service/qwerty/')
        .query({ order: 'descending', count: 25, limit: -1 })
        .reply(200, { payload: 'OK' })
      .post('/service/qwerty/', {
        name: 'David Bowie',
        value: 69,
        location: 'Madrid, Spain',
      }).reply(200, { payload: 'OK' })
      .put('/service/qwerty/', {
        name: 'David Bowie',
        value: 69,
        location: 'Madrid, Spain',
        RIP: true,
      }).reply(200, { payload: 'OK' })
      .delete('/service/qwerty/')
        .reply(204);
  });

  it('get() data should be sent as query string and omit url params', (done) => {
    const get = sdk.get('service/:uuid/');
    get({
      uuid: 'qwerty',
      order: 'descending',
      count: 25,
      limit: -1,
    }).then(data => {
      expect(data.body.payload).to.equal('OK');
      done();
    });
  });

  it('patch(), post() and put() data should be sent in the body and omit url params', (done) => {
    const post = sdk.post('service/:uuid/');
    const patch = sdk.patch('service/:uuid/');
    const put = sdk.put('service/:uuid/');

    all([
      patch({ RIP: true }).catch(({ message }) => {
        expect(message).to.equal('no values provided for key `uuid`');
      }),
      post({
        uuid: 'qwerty',
        name: 'David Bowie',
        value: 69,
        location: 'Madrid, Spain',
      }).then(data => {
        expect(data.body.payload).to.equal('OK');
      }),
      put({
        uuid: 'qwerty',
        name: 'David Bowie',
        value: 69,
        location: 'Madrid, Spain',
        RIP: true,
      }).then(data => {
        expect(data.body.payload).to.equal('OK');
      }),
    ]).then(() => done())
      .catch(done);
  });

  it('delete() should ignore non url params', (done) => {
    const del = sdk.del('service/:uuid/');

    del({ uuid: 'qwerty', invalid: true, more: 'stuff' }).then(data => {
      expect(data.status).to.equal(204);
      done();
    });
  });

  after(ensureNoPendingRequests);
});

describe('Headers', () => {
  const headers1 = {
    'cache-control': 'no-cache',
    'accept-language': 'da, en-gb;q=0.8, en;q=0.7',
  };

  const headers2 = {
    'if-match': 'qwerty',
    'max-forwards': 5,
    'user-agent': 'sdktor/2.0',
    'accept-language': 'en, es',
  };

  before(() => {
    mockRoot.get('/service/').reply(204);
    mockRoot.get('/service/').reply(204);
    mockRoot.get('/service/qwerty/meta/').reply(204);
  });

  it('sends the base headers', (done) => {
    const get = sdk.get('service/');
    get().then(data => {
      expect(data.req.headers).to.eql(BASE_HEADERS);
      expect(data.status).to.equal(204);
      done();
    });
  });

  it('at() accepts extra headers', (done) => {
    const service = sdk.at('service/', headers1);
    const get = service.get();

    get().then(data => {
      expect(data.req.headers).to.eql(
        merge({}, BASE_HEADERS, headers1)
      );
      done();
    });
  });

  it('recursive routes headers override base headers', (done) => {
    const service = sdk.at('service/:uuid/', headers1);
    const get = service.get('meta/', headers2);

    get({ uuid: 'qwerty' }).then(data => {
      expect(data.req.headers).to.eql(
        merge({}, BASE_HEADERS, headers1, headers2)
      );
      done();
    });
  });

  after(ensureNoPendingRequests);
});

describe('Init Options', () => {
  let localSdk;
  const basePostReq = (res, ok) => {
    if (res.status === 401) {
      res.body.succeeded = false; // eslint-disable-line no-param-reassign
      expect(ok).to.equal(false);
    } else {
      res.body.succeeded = true; // eslint-disable-line no-param-reassign
      expect(ok).to.equal(true);
    }

    return res;
  };

  const indentityBeforeSend  = data => {
    expect(data).to.have.property('params');
    expect(data).to.have.property('path');
    expect(data).to.have.property('headers');
    return data;
  }

  before(() => {
    localSdk = sdktor(ROOT_URI, BASE_HEADERS, {
      postRequest: [basePostReq],
      beforeSend: indentityBeforeSend,
    });
    mockRoot.get('/service/').reply(200, { payload: 'OK' });
    mockRoot.get('/service/bad/').reply(401, { payload: 'FAILED' });
    mockRoot.get('/service/uuid/').reply(200, { payload: 'OK' });
    mockRoot.get('/service/meta/').reply(200, { payload: 'OK' });
    mockRoot.get('/service/').reply(200, { payload: 'OK' });
    mockRoot.get('/before-send/with-at/')
      .reply(200, { payload: 'OK' });
    mockRoot.get('/scoped/before-send/with-at-and/norris/kid/')
      .reply(200, { payload: 'OK' });
    mockRoot.get('/nested/before-sends/').reply(200, { payload: 'OK' });
    mockRoot.get('/nested/post-requests/').reply(200, { payload: 'OK' });
  });

  it('Should apply post request middleware', (done) => {
    const get = localSdk.get('service/');
    get().then(({ body }) => {
      expect(body.payload).to.equal('OK');
      expect(body.succeeded).to.equal(true);
      expect(Object.keys(body).length).to.equal(2);
      done();
    });
  });

  it('Should apply post request middleware for unsucessful requests', (done) => {
    const get = localSdk.get('service/bad/');
    get().catch(({ response }) => {
      const { body } = response;
      expect(body.payload).to.equal('FAILED');
      expect(body.succeeded).to.equal(false);
      expect(Object.keys(body).length).to.equal(2);
      done();
    });
  });

  it('Should apply postRequest middleware recursively ', (done) => {
    const privatePostReq = (res, ok) => {
      expect(ok).to.equal(true);
      res.body.uuid = 'my-uuid'; // eslint-disable-line no-param-reassign
      return res;
    };

    const serviceSdk = localSdk.at('service/', null, {
      postRequest: [privatePostReq],
    });
    const get = serviceSdk.get(':uuid/');
    get({ uuid: 'uuid' }).then(({ body }) => {
      expect(body.payload).to.equal('OK');
      expect(body.succeeded).to.equal(true);
      expect(body.uuid).to.equal('my-uuid');
      expect(Object.keys(body).length).to.equal(3);
      done();
    });
  });

  it('should apply postRequest middleware in order', (done) => {
    const newBasePostReq = (res, ok) => {
      expect(ok).to.equal(true);
      res.body.succeeded = 'overriden'; // eslint-disable-line no-param-reassign
      return res;
    };

    const post1 = (res, ok) => {
      expect(ok).to.equal(true);
      res.body.post = 1; // eslint-disable-line no-param-reassign
      return res;
    };

    const post2 = (res, ok) => {
      expect(ok).to.equal(true);
      res.body.post = 2; // eslint-disable-line no-param-reassign
      return res;
    };

    const post3 = (res, ok) => {
      expect(ok).to.equal(true);
      res.body.post = 3; // eslint-disable-line no-param-reassign
      return res;
    };

    const serviceSdk = localSdk.at('service/', null, {
      postRequest: [newBasePostReq, post1, post2],
    });

    const meta = serviceSdk.at('meta/', null, {
      postRequest: [post3],
    });

    meta.get()().then(({ body }) => {
      expect(body.payload).to.equal('OK');
      expect(body.succeeded).to.equal('overriden');
      expect(body.post).to.equal(3);
      expect(Object.keys(body).length).to.equal(3);

      done();
    });
  });

  it('should reject the promise if a middleware throws', (done) => {
    const msg = `
      This is my error.
      There are many like it but this one is mine.`;

    const errorPostReq = (res, ok) => {
      expect(ok).to.equal(true); // req succeeded, we throw anyways
      throw new Error(msg);
    };
    const serviceSdk = localSdk.at('service/', null, {
      postRequest: [errorPostReq],
    });

    const get = serviceSdk.get();

    get().catch(err => {
      expect(err).to.be.instanceof(Error);
      expect(err.message).to.equal(msg);
      done();
    });
  });

  it('at() beforeSend should override root beforeSend', (done) => {
    const beforeSend = ({ params, path, headers }) => {
      return { params, headers, path: `${path}with-at/` };
    }

    const { get } = localSdk.at('before-send/', null, { beforeSend });
    get()().then(({ req }) => {
      expect(req.path).to.equal('/api/v1/before-send/with-at/');
      done();
    });
  });

  it('beforeSend appends params on the fly', (done) => {
    const beforeSend = ({ params, path, headers }) => {
      return {
        params: merge(params, { context: 'scoped' }),
        path: `${path}with-at-and/:chuck/:karate/`,
        headers,
      };
    }

    const { get } = localSdk.at(':context/', null, { beforeSend });
    get('before-send/')({ chuck: 'norris', karate: 'kid'}).then(({ req }) => {
      expect(req.path).to.equal(
        '/api/v1/scoped/before-send/with-at-and/norris/kid/'
      );
      done();
    });
  });

  it('nested beforeSends get called in order', (done) => {
    const slots = Array(5).fill().map((_, i) => i);
    const calls = [];
    const beforeSends = slots.map((_, i) => data => {
      calls.push(i);
      return data;
    });

    const _sdk = sdktor(ROOT_URI, BASE_HEADERS, {
      beforeSend: beforeSends.slice(0, -1),
    });

    _sdk
      .at('', null ,{ beforeSend: beforeSends[beforeSends.length - 1 ]})
      .get('nested/before-sends/')().then(({ req }) => {
      expect(req.path).to.equal('/api/v1/nested/before-sends/');
      expect(slots).to.eql(calls);
      done();
    });
  });

  it('nested postRequests get called in order', (done) => {
    const slots = Array(5).fill().map((_, i) => i);
    const calls = [];
    const postRequests = slots.map((_, i) => data => {
      calls.push(i);
      return data;
    });

    const _sdk = sdktor(ROOT_URI, BASE_HEADERS, {
      postRequest: postRequests.slice(0, -1),
    });

    _sdk
      .at('', null ,{ postRequest: postRequests[postRequests.length - 1 ]})
      .get('nested/post-requests/')().then(({ req }) => {
      expect(req.path).to.equal('/api/v1/nested/post-requests/');
      expect(slots).to.eql(calls);
      done();
    });
  });

  after(ensureNoPendingRequests);
});
