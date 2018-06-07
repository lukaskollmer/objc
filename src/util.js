const retainedGlobals = [];

module.exports = {
  _retainGlobal: obj => retainedGlobals.push(obj)
};
