class Avatars {
  constructor () {
    this.avatars = {}
    this.users = {}
  }

  enter (u) {
    this.users[u.id] = u.name
    this.avatars[u.id] = u.avatar
    this.addAvatar(u.id)
  }

  exit (id) {
    delete this.users[id]
    delete this.avatars[id]
    this.removeAvatar(id)
  }

  setMyAvatar (id, message) {
    const myAvatar = document.getElementById('me')
    const img = document.createElement('img')
    img.classList.add('avatar')
    img.src = this.avatars[id]
    myAvatar.append(img)
    const label = document.createTextNode(message)
    myAvatar.appendChild(label)

    // entry in the general area
    this.addAvatar(id)

    // personalize the logout menu
    document.getElementById('user_name').innerText = `Logout ${this.users[id]}`
  }

  addAvatar (id) {
    const container = document.getElementById('log')
    let cn
    if (container.hasChildNodes()) {
      const index = Math.floor(Math.random() * container.childNodes.length)
      cn = container.childNodes[index]
    }
    if (this.avatars[id]) {
      let img = document.getElementById(id)
      if (!img) {
        img = document.createElement('img')
        img.id = id
        img.classList.add('user_image')
        img.classList.add('avatar')
        img.src = this.avatars[id]
        if (cn) {
          container.insertBefore(img, cn.nextSibling)
        } else {
          container.appendChild(img)
        }
      }
    }
    this.updateCount()
  }

  active (id) {
    const img = document.getElementById(id)
    if (img) {
      if (img.timeout) {
        clearTimeout(img.timeout)
      }
      img.classList.add('active')
      img.timeout = setTimeout(() => {
        img.classList.remove('active')
      },1000)
    }
  }

  updateCount () {
    const counter = document.getElementById('counter')
    const ids = Object.getOwnPropertyNames(this.users)
    let fake = 0
    ids.forEach((v) => {
      if (v.indexOf('pokenats_') === 0) {
        fake++
      }
    })
    counter.innerHTML = `${ids.length} users here - ${fake} are bots.`
  }

  removeAvatar (who) {
    const w = document.getElementById(who)
    if (w) {
      w.remove()
      this.updateCount()
    }
  }
}
