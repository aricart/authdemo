let user_image_url
function getUserImage () {
  return user_image_url
}

let disconnectAuth
function logout () {
  disconnectAuth = true
  exit()
}

function auth () {
  gapi.load('auth2', () => {
    gapi.auth2.init().then(authOK, authError)
  })
}

async function authOK () {
  const ga = await gapi.auth2.getAuthInstance()
  if (!ga.isSignedIn.get()) {
    location.href = '/index.html'
  } else {
    registerUser(ga)
    run()
  }
}

function authError (err) {
  console.log(err)
  alert('init error - check the console')
}

function registerUser(ga) {
  const gu = ga.currentUser.get()
  const p = gu.getBasicProfile()
  UserContext.setUserInfo(p.getName(), p.getImageUrl())
}

async function exit () {
  if (isConnected()) {
    disconnectNATS()
  }
  if (disconnectAuth) {
    const ga = await gapi.auth2.getAuthInstance()
    if (ga.isSignedIn.get()) {
      ga.disconnect()
    }
  }
  location.href = '/index.html'
  return true
}
