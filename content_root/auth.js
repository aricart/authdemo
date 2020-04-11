function auth () {
  return new Promise((resolve, reject) => {
    gapi.load('auth2', () => {
      gapi.auth2.init().then(() => {
        gapi.auth2.getAuthInstance()
          .then((ga) => {
            if (!ga.isSignedIn.get()) {
              reject()
            } else {
              registerUser(ga)
              resolve()
            }
          })
      }, reject)
    })
  })
}

function registerUser (ga) {
  const gu = ga.currentUser.get()
  const p = gu.getBasicProfile()
  UserContext.setUserInfo(p.getName(), p.getImageUrl())
}

async function disconnect () {
  const ga = await gapi.auth2.getAuthInstance()
  if (ga.isSignedIn.get()) {
    ga.disconnect()
  }
}
