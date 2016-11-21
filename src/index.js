var exec = require('child_process').execSync
var rimraf = require('rimraf')
var crypto = require('crypto')

var Ftp = require('jsftp')
Ftp = require('./jsftp-rmr')(Ftp)

var async = require('async')
var path = require('path')
var fs = require('fs')

function validateFTP (ftpData) {
  return new Promise((resolve, reject) => {
    let ftp = new Ftp({
      host: ftpData.host,
      port: ftpData.port || 21
    })
    ftp.auth(ftpData.username, ftpData.password, (err) => {
      if (err) {
        reject('FTP could not connect')
      } else {
        resolve('Connected')
      }
    })
  })
}

class DeployerJS {

  constructor (config) {
    this.state = {
      config: {
        ftp: {
          host: 'localhost',
          port: '21',
          username: '',
          password: '',
          path: 'public_html/',
          continueOnError: false
        },
        git: {
          repo: '',
          branch: 'master'
        }
      },
      ftp: null,
      localRoot: '',
      partialFilePaths: [],
      partialDirectories: []
    }

    // Merge FTP
    Object.assign(this.state.config.ftp, config.ftp)
    
    // Merge GIT
    Object.assign(this.state.config.git, config.git)

    if (this.validateConfig()) {
      this.configComlete()
    } else {
      throw new Error('Config is incorrect')
    }
  }

  validateConfig () {
    if (this.state.config.git.repo === '') {
      return false
    }
    return true
  }

  configComlete () {
    this.state.ftp = new Ftp({
      host: this.state.config.ftp.host,
      port: this.state.config.ftp.port || 21
    })
    this.state.ftp.useList = true
    this.state.ftp.auth(this.state.config.ftp.username, this.state.config.ftp.password, (err) => {
      if (err) {
        throw new Error('FTP could not connect')
      } else {
        console.log('Connected')
      }
    })
  }

  has (obj, key) {
    return Object.prototype.hasOwnProperty.call(obj, key)
  }

  arrayUnique (array) {
    var a = array.concat()
    for(var i=0; i<a.length; ++i) {
      for(var j=i+1; j<a.length; ++j) {
        if(a[i] === a[j]) {
          a.splice(j--, 1)
        }
      }
    }
    return a
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

      // Delete gitdata project folder
      return rimraf('gitdata/' + folderHash, (err) => {
        if (err) {
          reject(err)
        } else {
          exec(cmd)
          this.state.localRoot = 'gitdata/' + folderHash
          resolve('gitdata/' + folderHash)
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
      this.state.ftp.raw('quit')
      throw new Error(startDir + ' is not a valid location')
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
    let fullRemoteDirectory = path.join(this.state.config.ftp.path, val)
    this.state.ftp.raw('cwd', fullRemoteDirectory, (err) => {
      if (err) {
        this.state.ftp.raw('mkd', fullRemoteDirectory, (err) => {
          if (err) {
            cb(err)
          } else {
            cb()
          }
        })
      } else {
        cb()
      }
    })
  }

  ftpUploadFiles (val, cb) {
    let fullLocalPath = path.join(this.state.localRoot, val)
    let fullRemotePath = path.join(this.state.config.ftp.path, val)
    this.state.ftp.put(fullLocalPath, fullRemotePath, (err) => {
      if (err) {
        if (this.state.ftp.continueOnError) {
          cb()
        } else {
          cb(err)
        }
      } else {
        cb()
      }
    })
  }

  deployAllFiles () {
    return new Promise((resolve, reject) => {
      // Clone git repo
      this.cloneGitRepo().then((res) => {
        // Parse dir
        this.dirParseSync(res)
        // Clean everything in this.state.config.ftp.path
        this.cleanRemotePath().then(() => {
          // Make directories if needed
          async.eachSeries(this.state.partialDirectories, this.ftpMakeDirectoriesIfNeeded.bind(this), (err) => {
            if (err) {
              this.state.ftp.raw('quit')
              reject('Problem creating directories')
            } else {
              // Upload files
              async.eachSeries(this.state.partialFilePaths, this.ftpUploadFiles.bind(this), (err) => {
                this.state.ftp.raw('quit')
                if (err) {
                  reject('Could not upload files')
                } else {
                  resolve('Success')
                }
              })
            }
          })
        }, (err) => {
          this.state.ftp.raw('quit')
          reject('Could not clean remote path')
        })
      }, (err) => {
        this.state.ftp.raw('quit')
        reject('Could not clone git repo')
      })
    })
  }

  findCommitedFiles (commits) {
    let upload = []
    let removed = []
    commits.forEach((val, index) => {
      upload = upload.concat(val.added)
      upload = upload.concat(val.modified)
      removed = removed.concat(val.removed)
    })  
    return {
      upload: this.arrayUnique(upload),
      removed: this.arrayUnique(removed)
    }
  }

  ftpRemoveFiles (val, cb) {
    let fullRemotePath = path.join(this.state.config.ftp.path, val)
    this.state.ftp.raw('dele', fullRemotePath, (err) => {
      if (err) {
        if (this.state.ftp.continueOnError) {
          cb()
        } else {
          cb(err)
        }
      } else {
        cb()
      }
    })
  }

  makeFolderPathsFromCommits (files) {
    let paths = []
    files.forEach((filePath, index) => {
      if (filePath === '/') {
        return ['/']
      }
      const parts = filePath.split(/[\/\\]/)
      parts.pop()
      let finalPaths = parts.map((el, i) => parts.slice(0, parts.length - i).join('/').replace(/^$/, '/'))
      paths = paths.concat(finalPaths)
    })
    paths = this.arrayUnique(paths)
    paths = paths.sort(function(a, b) {
      return b.length - a.length
    })
    return paths
  }

  deployCommitedFiles (commits) {
    return new Promise((resolve, reject) => {
      // Clone git repo
      this.cloneGitRepo().then((res) => {

        // Find commited files
        let commitedFiles = this.findCommitedFiles(commits)

        // Create directores
        let createFolderPaths = this.makeFolderPathsFromCommits(commitedFiles.upload)
        async.eachSeries(createFolderPaths, this.ftpMakeDirectoriesIfNeeded.bind(this), (err) => {
            if (err) {
              this.state.ftp.raw('quit')
              reject('Problem creating directories')
            } else {
              // Delete files
              async.eachSeries(commitedFiles.removed, this.ftpRemoveFiles.bind(this), (err) => {
                if (err) {
                    this.state.ftp.raw('quit')
                    reject('Problem removing files')
                } else {
                  async.eachSeries(commitedFiles.upload, this.ftpUploadFiles.bind(this), (err) => {
                    this.state.ftp.raw('quit')
                    if (err) {
                      reject('Could not upload files')
                    } else {
                      resolve('Success')
                    }
                  })
                }
              })
            }
        })

      }, (err) => {
        this.state.ftp.raw('quit')
        reject('Could not clone git repo')
      })
    })
  }

}

module.exports = {
    DeployerJS: DeployerJS,
    validateFTP: validateFTP
}
