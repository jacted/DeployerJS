var exec = require('child_process').execSync
var rimraf = require('rimraf')
var crypto = require('crypto')

var Ftp = require('jsftp')
Ftp = require('./jsftp-rmr')(Ftp)

var async = require('async')
var path = require('path')
var fs = require('fs')

class DeployerJS {

  constructor () {
    this.state = {
      config: {
        ftp: {
          host: 'localhost',
          port: '21',
          username: 'bob',
          password: '1234',
          path: 'public_html/'
        },
        git: {
          repo: 'https://github.com/jacted/speed-monitor.git',
          branch: 'master'
        }
      },
      ftp: null,
      localRoot: '',
      partialFilePaths: [],
      partialDirectories: []
    }
    this.configComlete()
  }

  configComlete () {
    this.state.ftp = new Ftp({
      host: this.state.config.ftp.host,
      port: this.state.config.ftp.port || 21
    })

    this.state.ftp.auth(this.state.config.ftp.username, this.state.config.ftp.password, (err) => {
      if (err) {
        console.log('Not connected')
      } else {
        console.log('Connected')
      }
    })
  }

  has (obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key)
  }

  cloneGitRepo () {
    return new Promise((resolve, reject) => {
      let cmd = 'git clone ' + this.state.config.git.repo

      // Specific branch
      if (this.state.config.git.branch) {
        cmd += ' -b ' + this.state.config.git.branch
      }

      // Get folder
      var folderHash = crypto.createHash('md5').update(cmd).digest('hex')
      cmd += ' gitdata/' + folderHash

      // Delte gitdata project folder
      return rimraf(__dirname + '/gitdata/' + folderHash, (err) => {
        if (err) {
          reject(err)
        } else {
          exec(cmd)
          this.state.localRoot = __dirname + '/gitdata/' + folderHash
          resolve(__dirname + '/gitdata/' + folderHash)
        }
      })
    })
  }

  canIncludeFile (filePath) {
    if (filePath.indexOf('.git') !== -1 || filePath.toLowerCase().indexOf('readme.md') !== -1) {
      return false
    }
    return true
  }

  dirParseSync (startDir, result) {
    // initialize the `result` object if it is the first iteration
    if (result === undefined) {
      var result = {}
      result[path.sep] = []
    }

    // check if `startDir` is a valid location
    if (!fs.existsSync(startDir)) {
      console.log(startDir + ' is not an existing location')
    }

    // iterate throught the contents of the `startDir` location of the current iteration
    let files = fs.readdirSync(startDir)
    for (let i = 0; i < files.length; i++) {
      let currFile = path.join(startDir, files[i])
      if (fs.lstatSync(currFile).isDirectory()) {
        
        let tmpPath = path.relative(this.state.localRoot, currFile)

        if (this.canIncludeFile(tmpPath)) {
          if (!this.has(result, tmpPath)) {
            result[tmpPath] = []
            this.state.partialDirectories.push(tmpPath)
          }
          this.dirParseSync(currFile, result)
        }

      } else {
        
        let tmpPath = path.relative(this.state.localRoot, startDir)
        if (!tmpPath.length) {
					tmpPath = path.sep
				}

        let partialFilePath = path.join(tmpPath, files[i])
        if (this.canIncludeFile(partialFilePath)) {
          this.state.partialFilePaths.push(partialFilePath)
        }

      }
    }

  }

  cleanRemotePath () {
    return new Promise((resolve, reject) => {
      this.state.ftp.rmr(this.state.config.ftp.path, function (err) {
        if (err) {
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  ftpMakeDirectoriesIfNeeded (val, cb) {
    let fullRemoteDirectory = this.state.config.ftp.path + '' + val
    this.state.ftp.raw('cwd', fullRemoteDirectory, (err) => {
      if (err) {
        this.state.ftp.raw('mkd', fullRemoteDirectory, (err) => {
          cb()
        })
      } else {
        cb()
      }
    })
  }

  ftpUploadFiles (val, cb) {
    let fullLocalPath = path.join(this.state.localRoot, val)
    let fullRemotePath = this.state.config.ftp.path + '' + val

    this.state.ftp.put(fullLocalPath, fullRemotePath, (err) => {
      if (err) {
        cb(err)
      } else {
        cb()
      }
    })
  }

  deployAllFiles () {

    // Clone git repo
    let clonedRepoPath = this.cloneGitRepo()

    clonedRepoPath.then((res) => {

      // Parse dir
      this.dirParseSync(res)

      // Clean everything in this.state.config.ftp.path
      this.cleanRemotePath().then(() => {

        // Make directories if needed
        async.eachSeries(this.state.partialDirectories, this.ftpMakeDirectoriesIfNeeded.bind(this), (err) => {
          
          // Upload files
          async.eachSeries(this.state.partialFilePaths, this.ftpUploadFiles.bind(this), (err) => {
            this.state.ftp.raw('quit')
          })
          
        })

      }, (err) => {
        this.state.ftp.raw('quit')
      })

    }, (err) => {
      this.state.ftp.raw('quit')
    })

  }

}

var deployer = new DeployerJS()
deployer.deployAllFiles()