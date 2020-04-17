const fs = require('fs')
const url = require('url')
const puppeteer = require('puppeteer')
const config = require('./config.json')

  ;
(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  const loggedPages = new Set()
  const links = config.urls
  async function logPage (path) {
    if (loggedPages.has(path)) return { children: [] }
    loggedPages.add(path)
    await page.goto(path)
    return await page.evaluate((styleProperties, path) => {
      function deeplyLog (el, selector = '') {
        const computedStyle = getComputedStyle(el)
        const style = {}
        styleProperties.forEach(prop => { style[prop] = computedStyle.getPropertyValue(prop) })
        if (selector) selector += '>'
        selector += el.tagName
        if (el.id) selector += '#' + el.id
        if (el.classList.length) selector += '.' + [...el.classList].join('.')
        const charCount = [...el.childNodes].reduce((count, node) => {
          if (node instanceof Text) return count + node.data.length
          return count
        }, 0)
        const log = {
          selector,
          path,
          href: el.href,
          charCount,
          style,
          children: [...el.children].map(child => deeplyLog(child, selector))
        }
        return log
      }
      return deeplyLog(document.body)
    }, config.styleProperties, path)
  }
  const stylesMap = {}
  while (links.length) {
    const log = await logPage(links.shift())
    function mapStyles (log) {
      if (config.crawl && log.href) {
        const parsedHref = url.parse(log.href)
        if (parsedHref.protocol.startsWith('http') && config.hosts.indexOf(parsedHref.host) !== -1) {
          parsedHref.hash = null
          parsedHref.search = null
          links.push(url.format(parsedHref))
        }
      }
      if (log.charCount) {
        const key = JSON.stringify(log.style)
        stylesMap[key] = stylesMap[key] || []
        stylesMap[key].push({ charCount: log.charCount, path: log.path, selector: log.selector })
      }
      log.children.forEach(mapStyles)
    }
    mapStyles(log)
  }
  let seenStyles = {}
  let diffStyles = new Set()
  Object.entries(stylesMap).forEach(([name, value]) => {
    const style = JSON.parse(name)
    Object.entries(style).forEach(([name, value]) => {
      if(seenStyles[name] === undefined) {
        seenStyles[name] = value
      } else {
        if (seenStyles[name] !== value) {
          diffStyles.add(name)
        }
      }
    })
  })
  console.log([...diffStyles])
  const styles = []
  Object.entries(stylesMap).forEach(([name, value]) => {
    const style = Object.fromEntries(Object.entries(JSON.parse(name)).filter(([name]) => diffStyles.has(name)))
    styles.push({ style, data: value })
  })
  fs.writeFileSync('typography.json', JSON.stringify(styles, null, '  '))
  /*
  const consolidatedStylesList = Object.fromEntries(Object.entries(stylesMap).map(([name, value]) => {
    const consolidated = {
      chars: value.reduce((total, {charCount}) => total + charCount, 0),
      selectors: value.map(({selector}) => selector)
    }
    return [name, consolidated]
  }))
  console.log(JSON.stringify(consolidatedStylesList, null, '  '))
  fs.writeFileSync('typography.json', JSON.stringify(consolidatedStylesList, null, '  '))
  */
  await browser.close();
})()
