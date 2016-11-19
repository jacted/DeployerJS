let DeployerJS = require('../src/index')

try {
  let deployer = new DeployerJS({
    ftp: {
      username: 'bob',
      password: '1234'
    },
    git: {
      repo: 'https://github.com/jacted/speed-monitor.git'
    }
  })

  deployer.deployAllFiles().then((res) => {
    console.log(res)
  }, (err) => {
    console.log(err)
  })
} catch (e) {
  console.log(e)
}