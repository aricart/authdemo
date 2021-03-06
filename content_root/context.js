class UserContext {
  static setUserInfo (name, avatar) {
    UserContext.userName = name
    UserContext.avatar = avatar
  }

  static getCookie (name) {
    let cookies
    if (!cookies) {
      cookies = {}
      decodeURIComponent(document.cookie).split(';').forEach((v) => {
        v = v.trim()
        const sep = v.indexOf('=')
        const key = v.substring(0, sep)
        cookies[key] = v.substring(sep + 1)
      })
    }
    return cookies[name]
  }

  constructor () {
    const required = ['ws_server_url', 'cjwt', 'prefix', 'user_name']
    let foundAll = true
    required.forEach((v) => {
      if (!UserContext.getCookie(v)) {
        foundAll = false
      }
    })
    if (!foundAll) {
      location.href = '/index.html'
    }
  }

  me () {
    return {
      id: this.getID(),
      name: UserContext.userName,
      avatar: UserContext.avatar
    }
  }

  getName () {
    return UserContext.userName
  }

  getAvatar () {
    return UserContext.avatar
  }

  getID () {
    return UserContext.getCookie('prefix').split('.')[1]
  }

  getJWT () {
    return UserContext.getCookie('cjwt')
  }

  getPrefix () {
    return UserContext.getCookie('prefix')
  }

  getServerURL () {
    return UserContext.getCookie('ws_server_url')
  }
}
