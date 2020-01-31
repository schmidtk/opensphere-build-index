'use strict';

const Promise = require('bluebird');
const fs = require('fs');
const mkdirp = require('mkdirp');
const path = require('path');
const closureHelper = require('opensphere-build-closure-helper');
const slash = require('slash');

/**
 * Convert a path to an HTML `<script>` tag.
 * @param {string} filePath The script file path
 * @return {string} The script tag, or an empty string if the path was empty
 */
const createScriptTag = function(filePath) {
  return filePath ? ('<script src="' + slash(filePath) + '"></script>') : '';
};

/**
 * Create an HTML `<link>` tag for a stylesheet.
 * @param {string} filePath The CSS file path
 * @return {string} The link tag, or an empty string if the path was empty
 */
const createLinkTag = function(filePath) {
  return filePath ? ('<link rel="stylesheet" href="' + slash(filePath) + '">') : '';
};

/**
 * Read a file as a string.
 * @param {string} filePath The path to the file
 * @return {string} The file contents
 */
const readFile = function(filePath) {
  return fs.readFileSync(filePath, 'utf8');
};

/**
 * Add application CSS to the template.
 * @param {string} cssPath The path to the CSS file
 * @param {string} template The template
 * @return {string} The modified template
 */
const addAppCss = function(cssPath, template) {
  return template.replace('<!--APP_CSS-->', createLinkTag(cssPath));
};

/**
 * Add application JavaScript to the template.
 * @param {string} scriptPath The path to the JavaScript file
 * @param {string} template The template
 * @return {string} The modified template
 */
const addAppScript = function(scriptPath, template) {
  return template.replace('<!--APP_JS-->', createScriptTag(scriptPath));
};

/**
 * Add application CSS to the template.
 * @param {string} template The template
 * @param {string} inputFile The input file containing CSS href paths
 * @return {string} The modified template
 */
const addVendorCss = function(template, inputFile) {
  let files;

  try {
    const fileContent = fs.readFileSync(inputFile, 'utf8');
    files = fileContent.split('\n');
  } catch (e) {
    console.error('ERROR: failed reading vendor styles from ' + inputFile);
    console.error(e);
    process.exit(1);
  }

  if (files && files.length > 0) {
    console.log('Adding ' + files.length + ' vendor styles from ' + inputFile);

    // add the application css
    const links = files.map(function(file) {
      return createLinkTag(file);
    });

    template = template.replace('<!--VENDOR_CSS-->', links.join('\n'));
  } else {
    // strip the tag
    template = template.replace('<!--VENDOR_CSS-->', '');
  }

  return template;
};

/**
 * Get the list of vendor scripts.
 * @param {string} inputFile The input file containing the list of scripts
 * @return {Array<string>} The vendor scripts.
 */
const getVendorScripts = function(inputFile) {
  let files;

  try {
    const fileContent = fs.readFileSync(inputFile, 'utf8');
    files = fileContent.split('\n');
  } catch (e) {
    console.error('ERROR: failed reading vendor scripts from ' + inputFile);
    console.error(e);
    process.exit(1);
  }

  return files;
};

/**
 * Add vendor JS to the template.
 * @param {string} template The template
 * @param {string} inputFile The input file containing the list of scripts
 * @return {string} The modified template
 */
const addVendorScripts = function(template, inputFile) {
  const files = getVendorScripts(inputFile);
  if (files && files.length > 0) {
    console.log('Adding ' + files.length + ' vendor scripts from ' + inputFile);

    const scripts = files.map(function(file) {
      return createScriptTag(file);
    });

    // add links to the template
    template = template.replace('<!--VENDOR_JS-->', scripts.join('\n'));
  } else {
    // strip the tag
    template = template.replace('<!--VENDOR_JS-->', '');
  }

  return template;
};

const buildCompiledIndex = function(options, templateOptions, basePath, appPath) {
  const id = templateOptions.id;
  const templateFile = templateOptions.file || id + '-template.html';
  const templatePath = !path.isAbsolute(templateFile) ? path.join(basePath, templateFile) : templateFile;
  const file = templatePath.replace(/-template.html$/, '.html');

  if (templateOptions.skip) {
    return Promise.resolve();
  }

  if (!fs.existsSync(templatePath)) {
    throw new Error('Missing template file ' + templatePath);
  }

  console.log('Creating compiled index from ' + file + '...');

  let template = readFile(templatePath);

  // replace application version and version path
  const version = options.appVersion || '';
  const packageVersion = options.overrideVersion || options.packageVersion || '';
  const versionPath = version ? (version + path.sep) : '';
  template = template.replace(/@appVersion@/g, version);
  template = template.replace(/@packageVersion@/g, packageVersion);
  template = template.replace(/@version@/g, slash(versionPath));

  // add vendor scripts/css
  const vendorCssPath = path.join(appPath, '.build',
    'resources-css-dist-' + id);
  const vendorJsPath = path.join(appPath, '.build',
    'resources-js-dist-' + id);
  template = addVendorCss(template, vendorCssPath);
  template = addVendorScripts(template, vendorJsPath);

  template = addAppCss(options.compiledCss, template);
  template = addAppScript(options.compiledJs, template);

  const indexPath = path.join(options.distPath, id + '.html');
  console.log('Writing compiled index to ' + indexPath);
  console.log();

  if (!fs.existsSync(options.distPath)) {
    mkdirp.sync(options.distPath);
  }

  fs.writeFileSync(indexPath, template);

  return Promise.resolve();
};

const buildDebugIndex = function(options, templateOptions, basePath, appPath) {
  const id = templateOptions.id;
  const templateFile = templateOptions.file || id + '-template.html';
  const templatePath = !path.isAbsolute(templateFile) ? path.join(basePath, templateFile) : templateFile;
  const file = templatePath.replace(/-template.html$/, '.html');

  if (templateOptions.skip) {
    return Promise.resolve();
  }

  if (!fs.existsSync(templatePath)) {
    throw new Error('Missing template file ' + templatePath);
  }

  console.log('Creating debug index from ' + file + '...');

  let template = readFile(templatePath);

  // remove version tags
  template = template.replace(/@version@/g, '');

  // replace application version
  template = template.replace(/@appVersion@/g, 'dev');
  template = template.replace(/@packageVersion@/g, 'dev');

  // add vendor css
  const vendorCssPath = path.join(appPath, '.build', 'resources-css-debug-' + id);
  template = addVendorCss(template, vendorCssPath);

  // add application css
  template = addAppCss(options.debugCss, template);

  if (template.indexOf('<!--VENDOR_JS-->') > -1) {
    // add vendor scripts
    const vendorJsPath = path.join(appPath, '.build', 'resources-js-debug-' + id);
    const vendorScripts = getVendorScripts(vendorJsPath).map(createScriptTag);

    // add the loader to the template and clear the script so it isn't added twice
    template = template.replace('<!--VENDOR_JS-->', vendorScripts.join('\n'));
  }

  if (template.indexOf('<!--APP_JS-->') > -1) {
    const closureLibPackage = path.join('google-closure-library', 'package.json');
    const closureLibPath = path.dirname(require.resolve(closureLibPackage, {
      // try cwd first to get the version required by the application
      paths: [process.cwd(), __dirname]
    }));
    const closureSrcPath = path.join(closureLibPath, 'closure', 'goog');
    const appLoaderPath = getAppLoaderPath(appPath);

    // add GCC debug defines, Closure base/deps, and application loader
    const appScripts = [
      path.relative(basePath, path.join(appPath, '.build', 'gcc-defines-debug.js')),
      path.relative(basePath, path.join(closureSrcPath, 'base.js')),
      path.relative(basePath, path.join(closureSrcPath, 'deps.js')),
      path.relative(basePath, appLoaderPath)
    ].map(createScriptTag);

    // add the loader to the template (clears the tag if the loader was already added)
    template = template.replace('<!--APP_JS-->', appScripts.join('\n'));
  }

  const indexPath = path.join(basePath, id + '.html');
  console.log('Writing debug index to ' + indexPath);
  console.log();

  fs.writeFileSync(indexPath, template);

  return Promise.resolve();
};

/**
 * Build the application debug loader.
 * @param {string} basePath The base path.
 * @return {Promise} A promise that resolves when the loader.
 */
const buildDebugLoader = function(basePath) {
  const appLoaderPath = getAppLoaderPath(basePath);
  const gccArgs = require(path.join(basePath, '.build', 'gcc-args'));
  return closureHelper.writeDebugLoader(gccArgs, appLoaderPath);
  ;
};

/**
 * Get the path for the application debug loader.
 * @param {string} basePath The base path.
 * @return {string} The path to the loader.
 */
const getAppLoaderPath = function(basePath) {
  return path.join(basePath, '.build', 'app-loader.js');
};

/**
 * Build index HTML files for a project.
 * @param {Object} options The index generation options.
 * @param {boolean} debugOnly If the compiled index should be skipped.
 * @return {Promise} A promise that resolves when the index is ready.
 */
const buildIndex = function(options, debugOnly) {
  if (options && options.templates) {
    const basePath = options.basePath || process.cwd();
    const appPath = options.appPath || basePath;

    // generate each index from the templates
    return Promise.map(options.templates, function(template) {
      // only write the debug application loader once, when processing "index"
      const promise = template.id === 'index' && !template.skip ?
        buildDebugLoader(appPath).then(undefined, function(reason) {
          throw new Error(`Failed writing debug loader: ${reason}`);
        }) : Promise.resolve();

      promise.then(function() {
        buildDebugIndex(options, template, basePath, appPath);
      });

      if (!debugOnly) {
        promise.then(function() {
          return buildCompiledIndex(options, template, basePath, appPath);
        });
      }

      return promise;
    });
  }

  return Promise.resolve();
};

/**
 * Build index HTML files for a project from an options file.
 * @param {string} file Path to the options file.
 * @param {boolean} debugOnly If the compiled index should be skipped.
 * @return {Promise} A promise that resolves when the index is ready.
 */
const buildIndexFromFile = function(file, debugOnly) {
  let index;

  console.log('Loading index options from ' + file);

  try {
    index = require(file);
  } catch (e) {
    console.error('ERROR: failed loading index file ' + file);
    console.error(e);
    process.exit(1);
  }

  if (index) {
    return buildIndex(index, debugOnly);
  }

  return Promise.resolve();
};

module.exports = {
  buildIndex: buildIndex,
  buildIndexFromFile: buildIndexFromFile
};
