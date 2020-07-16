const fs          = require('fs');
      const mkdirp      = require('mkdirp');
      const path        = require('path');

function FileReporter(config) {
  var fileName = config.output_path;
  this.fileName = fileName;

  try {
    mkdirp.sync(path.dirname(fileName));
  }
  catch(e) {
    console.log("error:", this.fileName, String(e));
  }
}
FileReporter.prototype.report = function(msg) {
  try {
    var fd = fs.openSync(this.fileName, "w");
    fs.writeSync(fd, msg, 0, msg.length, null);
    fs.closeSync(fd);
  }
  catch(e) {
    console.log("error:", this.fileName, String(e));
  }
};
FileReporter.prototype.done = function() {
};

module.exports = FileReporter;
