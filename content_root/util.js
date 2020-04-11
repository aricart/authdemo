function debounce (fn, wait, immediate) {
  let timeout
  return function () {
    let context = this, args = arguments
    let later = function () {
      timeout = null
      if (!immediate) fn.apply(context, args)
    }
    let callNow = immediate && !timeout
    clearTimeout(timeout)
    timeout = setTimeout(later, wait)
    if (callNow) fn.apply(context, args)
  }
}