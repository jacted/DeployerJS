let { DeployerJS, validateFTP } = require('../src/index')

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

// Test validate ftp
validateFTP({
  host: '',
  port: 21,
  username: 'bob',
  password: '1234'
}).then((res) => {
  console.log(res)
}, (err) => {
  console.log(err)
})