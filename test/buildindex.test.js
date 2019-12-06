const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const rimraf = Promise.promisify(require('rimraf'));
const mkdirp = Promise.promisifyAll(require('mkdirp'));
const path = require('path');
const closureHelper = require('opensphere-build-closure-helper');
const osIndex = require('../buildindex.js');

const chai = require('chai');
const spies = require('chai-spies');
chai.use(spies);

const expect = chai.expect;

const mockDir = path.resolve(__dirname, 'mock');
const modulesDir = path.join(mockDir, 'node_modules', 'test');
const buildDir = path.join(mockDir, '.build');
const distDir = path.join(mockDir, 'dist');
const numResources = 5;

/**
 * The gcc args file generated by opensphere-build-resolver.
 * @type {string}
 */
const gccArgsFile = 'gcc-args.json';

const baseTemplate = '<!DOCTYPE html>\n' +
'<title>Test Template</title>\n' +
'<!--VENDOR_CSS-->\n' +
'<!--APP_CSS-->\n' +
'<div id="ng-app" ng-init="version=\'@appVersion@\';versionPath=\'@version@\'">\n' +
'<test-app></test-app>\n' +
'</div>\n' +
'<!--VENDOR_JS-->\n' +
'<!--APP_JS-->';

const noVendorTemplate = '<!DOCTYPE html>\n' +
'<title>Test Template</title>\n' +
'<!--APP_CSS-->\n' +
'<div id="ng-app" ng-init="version=\'@appVersion@\';versionPath=\'@version@\'">\n' +
'<test-app></test-app>\n' +
'</div>\n' +
'<!--APP_JS-->';

const noAppTemplate = '<!DOCTYPE html>\n' +
'<title>Test Template</title>\n' +
'<!--VENDOR_CSS-->\n' +
'<div id="ng-app" ng-init="version=\'@appVersion@\';versionPath=\'@version@\'">\n' +
'<test-app></test-app>\n' +
'</div>\n' +
'<!--VENDOR_JS-->';

/**
 * The resource files generated by the opensphere-build-resolver resource plugin.
 * @type {!Array<string>}
 */
const resourceFiles = [
  'resources-css-debug-index1',
  'resources-css-debug-index2',
  'resources-css-debug-noapp',
  'resources-css-debug-novendor',
  'resources-css-dist-index1',
  'resources-css-dist-index2',
  'resources-css-dist-noapp',
  'resources-css-dist-novendor',
  'resources-js-debug-index1',
  'resources-js-debug-index2',
  'resources-js-debug-noapp',
  'resources-js-debug-novendor',
  'resources-js-dist-index1',
  'resources-js-dist-index2',
  'resources-js-dist-noapp',
  'resources-js-dist-novendor'
];

/**
 * Recreate the build directory.
 * @return {Promise} A promise that resolves when the directory is ready.
 */
const cleanMockDirectory = function() {
  return rimraf(mockDir)
    .then(function() {
      return Promise.map([buildDir, distDir, modulesDir], function(dir) {
        return mkdirp.mkdirpAsync(dir);
      });
    });
};

/**
 * If an index has APP tags.
 * @param {string} key The index key.
 * @return {boolean}
 */
const hasAppTag = function(key) {
  return key.indexOf('noapp') === -1;
};

/**
 * If an index has APP tags.
 * @param {string} key The index key.
 * @return {boolean}
 */
const hasVendorTag = function(key) {
  return key.indexOf('novendor') === -1;
};

/**
 * Generate HTML templates.
 * @return {Promise} A promise that resolves when the templates are ready.
 */
const generateTemplates = function() {
  return Promise.map([
    path.join(mockDir, 'index1-template.html'),
    path.join(modulesDir, 'index2-template.html'),
    path.join(mockDir, 'noapp-template.html'),
    path.join(mockDir, 'novendor-template.html')
  ], function(file) {
    const template = !hasAppTag(file) ? noAppTemplate : !hasVendorTag(file) ? noVendorTemplate : baseTemplate;
    return fs.writeFileAsync(file, template);
  });
};

/**
 * Generate a test file.
 * @return {Promise} A promise that resolves when the files have been created.
 */
const generateResourceFiles = function() {
  return Promise.map(resourceFiles, function(fileName) {
    const filePath = path.join(buildDir, fileName);

    const fileParts = fileName.split('-');
    const ext = '.' + fileParts[1];

    const resourcePath = fileParts.join(path.sep);
    const resources = [];
    for (let i = 0; i < numResources; i++) {
      resources.push(path.join(resourcePath, i + ext));
    }

    const content = resources.join('\n');
    return fs.writeFileAsync(filePath, content);
  });
};

/**
 * Generate the gcc manifest file.
 * @return {Promise} A promise that resolves when the manifest has been created.
 */
const generateGccArgs = function() {
  const filePath = path.join(buildDir, gccArgsFile);
  const args = {
    js: [
      '!/not/included',
      '/also/not/from/google-closure-library/sources',
      '/included/src',
      '/also/included/src'
    ],
    entry_point: [
      'goog:test_entry'
    ]
  };

  return fs.writeFileAsync(filePath, JSON.stringify(args));
};

/**
 * Generate the index files.
 * @return {Promise} A promise that resolves when generation completes.
 */
const generateIndex = function() {
  return osIndex.buildIndex({
    appVersion: 'test-version',
    basePath: mockDir,
    distPath: path.join('test', 'mock', 'dist'),
    templates: [
      {
        id: 'index1'
      },
      {
        id: 'index2',
        file: path.join(modulesDir, 'index2-template.html')
      },
      {
        id: 'noapp'
      },
      {
        id: 'novendor'
      }
    ],
    debugCss: path.join('styles', 'debug.css'),
    compiledCss: path.join('styles', 'test.min.css'),
    compiledJs: 'test.min.js'
  });
};

before(function() {
  // we'll mock the results instead of invoking the Closure deps writer
  chai.spy.on(closureHelper, 'writeDebugLoader', () => Promise.resolve());

  return cleanMockDirectory()
    .then(generateTemplates)
    .then(generateResourceFiles)
    .then(generateGccArgs)
    .then(generateIndex);
});

describe('opensphere-build-index', function() {
  describe('debug index', function() {
    const indexFiles = {};

    it('generates debug index files from the templates', function() {
      expect(fs.existsSync(path.join(mockDir, 'index1.html')))
        .to.equal(true, 'first debug template missing');
      expect(fs.existsSync(path.join(mockDir, 'index2.html')))
        .to.equal(true, 'second debug template missing');
    });

    it('reads the debug index', function() {
      return Promise.map(['index1.html', 'index2.html', 'noapp.html', 'novendor.html'], function(fileName) {
        const key = fileName.replace(/\..*/, '');
        return fs.readFileAsync(path.join(mockDir, fileName), 'utf8').then(function(file) {
          indexFiles[key] = file;

          return Promise.resolve();
        });
      })
        .catch(function(e) {
          expect(e).to.equal(null, 'encountered an error reading index', e);
        });
    });

    it('replaces the version strings', function() {
      for (const key in indexFiles) {
        const index = indexFiles[key];
        const lines = index.split('\n');
        const versionLine = lines.find(function(line) {
          return /ng-init="version='dev';versionPath=''"/.test(line);
        });

        expect(versionLine).not.to.equal(null);
      }
    });

    it('adds link tags to the index', function() {
      for (const key in indexFiles) {
        const index = indexFiles[key];

        const lines = index.split('\n');
        const links = lines.filter(function(line) {
          return /^<link /.test(line);
        });

        let inspectedLinks = 0;

        if (hasVendorTag(key)) {
          for (let i = 0; i < numResources; i++) {
            const linkUrl = 'resources/css/debug/' + key + '/' + i + '.css';
            const linkTag = '<link rel="stylesheet" href="' + linkUrl + '">';
            expect(links[i]).to.equal(linkTag, key + ' missing css file from gcc resources');
            inspectedLinks++;
          }
        }

        if (hasAppTag(key)) {
          expect(links[inspectedLinks]).to.equal('<link rel="stylesheet" href="styles/debug.css">');
          inspectedLinks++;
        }

        expect(links.length).to.equal(inspectedLinks, key + ' has incorrect number of link elements');
      }
    });

    it('adds script tags to the index', function() {
      for (const key in indexFiles) {
        const index = indexFiles[key];
        const lines = index.split('\n');
        const scripts = lines.filter(function(line) {
          return /^<script src=/.test(line);
        });

        let inspectedScripts = 0;

        if (hasVendorTag(key)) {
          for (let i = 0; i < numResources; i++) {
            const scriptUrl = 'resources/js/debug/' + key + '/' + i + '.js';
            expect(scripts[i]).to.have.string(scriptUrl, key + ' missing/incorrect js file from gcc resources');
            inspectedScripts++;
          }
        }

        if (hasAppTag(key)) {
          expect(scripts[inspectedScripts]).to.have.string('.build/gcc-defines-debug.js',
            key + ' missing gcc debug defines');
          inspectedScripts++;

          expect(scripts[inspectedScripts]).to.have.string('google-closure-library/closure/goog/base.js',
            key + ' missing gcc base.js');
          inspectedScripts++;

          expect(scripts[inspectedScripts]).to.have.string('google-closure-library/closure/goog/deps.js',
            key + ' missing gcc deps.js');
          inspectedScripts++;

          expect(scripts[inspectedScripts]).to.have.string('.build/app-loader.js', key + ' missing app loader');
          inspectedScripts++;
        }

        expect(scripts.length).to.equal(inspectedScripts, key + ' has incorrect number of debug scripts');
      }
    });
  });

  describe('distribution index', function() {
    const indexFiles = {};

    it('generates distribution index files from the templates', function() {
      expect(fs.existsSync(path.join(distDir, 'index1.html')))
        .to.equal(true, 'first dist template missing');
      expect(fs.existsSync(path.join(distDir, 'index2.html')))
        .to.equal(true, 'first second template missing');
    });

    it('reads the distribution index', function() {
      return Promise.map(['index1.html', 'index2.html'], function(fileName) {
        return fs.readFileAsync(path.join(distDir, fileName), 'utf8').then(function(file) {
          const key = fileName.replace(/\.html/, '');
          indexFiles[key] = file;

          return Promise.resolve();
        });
      })
        .catch(function(e) {
          expect(e).to.equal(null, 'encountered an error reading index', e);
        });
    });

    it('replaces the version strings', function() {
      for (const key in indexFiles) {
        const index = indexFiles[key];
        const lines = index.split('\n');
        const versionLine = lines.find(function(line) {
          return /ng-init="version='test-version';versionPath='test-version\/'"/.test(line);
        });

        expect(versionLine).not.to.equal(null);
      }
    });

    it('adds link tags to the index', function() {
      for (const key in indexFiles) {
        const index = indexFiles[key];

        const lines = index.split('\n');
        const links = lines.filter(function(line) {
          return /^<link /.test(line);
        });

        expect(links.length).to.equal(numResources + 1, key + ' has incorrect number of link elements');

        for (let i = 0; i < numResources; i++) {
          const linkUrl = 'resources/css/dist/' + key + '/' + i + '.css';
          const linkTag = '<link rel="stylesheet" href="' + linkUrl + '">';
          expect(links[i]).to.equal(linkTag, key + ' missing css file from gcc resources');
        }

        expect(links[numResources]).to.equal('<link rel="stylesheet" href="styles/test.min.css">',
          key + ' missing compiled css file');
      }
    });

    it('adds script tags to the index', function() {
      for (const key in indexFiles) {
        const index = indexFiles[key];

        const lines = index.split('\n');
        const scripts = lines.filter(function(line) {
          return /^<script src=/.test(line);
        });

        expect(scripts.length).to.equal(numResources + 1, key + ' has incorrect number of script elements');

        for (let i = 0; i < numResources; i++) {
          const scriptUrl = 'resources/js/dist/' + key + '/' + i + '.js';
          const scriptTag = '<script src="' + scriptUrl + '"></script>';
          expect(scripts[i]).to.equal(scriptTag, key + ' missing/incorrect js file from gcc resources');
        }

        expect(scripts[numResources]).to.equal('<script src="test.min.js"></script>',
          key + ' missing compiled js file');
      }
    });
  });
});
