const
  myName = 'My Little HTTP Server',
  port = 3000;
// учебный пример того, что может уметь HTTP-сервер,

// конкретно этот умеет:
// ✔ роутинг
// ✔ обработку данных форм (GET и POST запросов)
// ✔ читает и устанавливает cookie 
// ✔ демонстрируется парсинг:
//    🌟 http-headers( автоматически, при обработке запроса --> request.headers)
//    🌟 URL ( urlObject = new URL ... )
//    🌟 cookies ( cookie.parse из npm пакета cookie https://www.npmjs.com/package/cookie )
//    🌟 GET-данные формы ( url.searchParams )
//    🌟 путь / url path ( path.parse )
//    🌟 POST-данные формы ( URLSearchParams() )
//   и по мелочам:
//    - JS History API

// для запуска нужны два файла mlserv.js и package.json
// ❶ устанавливаете зависимости командой:
//  npm install
// ❷ далее запускаете сервер: 
//  node mlserv.js
// ❸ потом заходим браузером на http://localhost:3000

// ВНИМАНИЕ!!! функции аутентификации намеренно наивны и не предназначены для использования, даже как каркас
// Это только примитивная демонстрация того, как на коленке написать сервер на nodejs,
// и имеет смысл только вместе с занятиями на которых разбирается...
// да, и никакой обработки ошибочных ситуаций, только хардкор!!!

import { createServer, STATUS_CODES } from 'node:http'
import { URL, URLSearchParams } from 'node:url'
import { parse as parsePath } from 'node:path'
import { parse as parseCookie } from 'cookie' // https://www.npmjs.com/package/cookie

const
  DB = {               // нелепая пародия на базу данных
    accounts: {
      // формат login: { pass:'password', name: 'userName' }
      user: { pass: '123', name: '👤USER' },   // это логины + пароли пользователей 
      admin: { pass: '321', name: '👑ADMIN' }, // да да, прям так... никого не стесняемся :)      
    },
    online: Object.create(null),  // а тут будем хранить сессии пользователей

    delOnlineUser(uid) { delete this.online[uid]; },

    getUserByCookie(uid) { return this.online?.[uid]; },

    loginUser(login, pass) {
      const testUser = this.accounts?.[login];
      if (pass && testUser && pass === testUser?.pass) {
        const UID = this.newUID();
        this.online[UID] = testUser;
        return UID;
      }
      return false;
    },

    newUID() { return Math.random(); }
  },
  server = createServer(async (request, response) => { // request - объект полученного запроса, response - объект ответа который будет отправлен, см https://nodejs.org/en/docs/guides/anatomy-of-an-http-transaction/
    const start = Date.now();
    console.log((new Date()).toLocaleTimeString(), request.method, request.url, 'HTTP/' + request.httpVersion);
    let // получим данные формы из  Request body в случае POST-запроса 
      postData = 'POST' === request.method ? await getAndParsePostBody(request) : null, // 
      urlObject = new URL(request.url, `http://${request.headers.host}`), // 🌟 разберем URL на части, подробней тут https://nodejs.org/api/url.html#url_url_strings_and_url_objects
      { code, responseHeaders, html } = getAnswer(urlObject, request.headers, postData); // 

    response.statusCode = code; // начинаем формировать ответ, первым делом отправляем status code
    response.setHeader('Content-Type', 'text/html; charset=utf-8'); // заголовок см. https://developer.mozilla.org/ru/docs/Glossary/MIME_type
    responseHeaders && Object.entries(responseHeaders)?.forEach(([name, val]) => response.setHeader(name, val));
    response.write(html);
    response.write((Date.now() - start)+'ms');
    response.end();    // завершаем ответ и отправляем его клиенту // response.end(html)
  });

server.listen(port, () => {
  console.log('Server start at http://localhost:' + port);
});

// далее идут вспомогательные функции --------------------------------------------------------------------------

function getAnswer(url, inHeaders, postData) { // наиважнейшая функция - формирует ответ исходя из запроса
  // >> получает url, заголовки_запроса и postData
  // << возвращает ответ состоящий из:
  //     status code см. https://developer.mozilla.org/ru/docs/Web/HTTP/Status
  //     заголовков см. https://developer.mozilla.org/ru/docs/Web/HTTP/Headers
  //     тела ответа (зачастую это HTML-код)
  let
    responseHeaders = { Server: myName }, // это объект для  заголовков ответа
    cookies = parseCookie(inHeaders.cookie || ''), //  🌟 см. https://www.npmjs.com/package/cookie#cookieparsestr-options
    user = getUser(cookies, postData || url.searchParams, responseHeaders); // 🌟 получаем пользователя на основе cookies и данных формы (POST данные приоритетнее чем GET)

  // ✔ РОУТИНГ !!! ветвление в зависимости от pathname называют routing или маршрутизация
  let path = parsePath(url.pathname);   // 🌟 https://nodejs.org/api/path.html#path_path_parse_path
  switch (path.dir) {
    case '/teststatus':    // пасхалка :)
      return { code: +path.name, html: `<h1>${path.name}</h1><h2>${STATUS_CODES[path.name]}</h2><a href='${+path.name - 1}'>&lt;&lt;${+path.name - 1}</a>&emsp;<a href='${+path.name + 1}'>${+path.name + 1}&gt;&gt;</a>`, responseHeaders };
    case '/':
      switch (path.base) {
        case 'favicon.ico':
          return { code: 301, html: '', responseHeaders: { 'Location': 'https://nodejs.org/static/images/favicons/favicon.ico' } };
        case '':
        case 'home':
        case 'index.html':
          return { code: 200, html: getHtml('home', user), responseHeaders };
        case 'about':
        case 'info':
          return { code: 200, html: getHtml(path.name, user), responseHeaders };
      }
    default:
      return { code: 404, html: '<img src="https://lleo.me/dnevnik/2015/12/johntravolta.gif">', responseHeaders };
  }
}

async function getAndParsePostBody(request) {
  // обработка POST запроса  сложнее чем GET, необходимо асинхронно работать с nodejs Stream см. https://habr.com/ru/post/479048/
  // суть в том что request это экземпляр класса http.ClientRequest см https://nodejs.org/api/http.html#http_class_http_clientrequest
  // который, в свою очередь наследован от Readable Stream см https://nodejs.org/api/stream.html#stream_stream
  // пример из документации: https://nodejs.org/api/stream.html#stream_api_for_stream_consumers
  // еще пример: https://nodejs.org/en/docs/guides/anatomy-of-an-http-transaction/#request-body
  request.setEncoding('utf8'); // Get the data as utf8 strings. If an encoding is not set, Buffer objects will be received.    
  const body = await new Promise(resolve => {
    let buff = '';
    request
      .on('data', chunk => buff += chunk)
      .on('end', () => resolve(buff));
  });
  return new URLSearchParams(body); //  🌟 применили интерфейс URLSearchParams() для POST form data
}

function getUser(cookies, searchParams, responseHeaders) { // получаем пользователя по cookies и данным html-формы
  let user = null; // главное в этой функции
  if (Object.keys(cookies).length > 0) console.log('\t cookies: ', cookies);

  // ✔ ЧИТАЕМ cookies
  if (cookies.uid) { // проверим не залогинен ли уже пользователь?
    const testUser = DB.getUserByCookie(cookies.uid);
    if (testUser?.name) {
      user = testUser;
      console.log(`\t клиент предъявил валидный cookie uid, значит это ${user.name}`);
    }
  }
  // ✔ ОБРАБОТЧИК ФОРМ !!! 
  if (searchParams.toString()) { // попросту считаем что если url.search  не пустой - значит пришли данные от формы
    console.log(`\t form data: ${searchParams}`);
    let UID,
      username = searchParams.get('username'),
      psw = searchParams.get('psw');
    if (username && psw && (UID = DB.loginUser(username, psw))) {
      user = DB.online[UID];
      responseHeaders['Set-Cookie'] = [`uid=${UID}`];  // ✔ УСТАНАВЛИВАЕМ клиенту cookie
      console.log(`\t login! ${username}|${psw} user=${user.name}`);
    }
    if (searchParams.has('logout')) {  // если пожелаешь мы тебя разлогиним
      console.log(`\t logout! user=${user?.name}`);
      DB.delOnlineUser(cookies.uid);
      user = null;
      responseHeaders['Set-Cookie'] = ['uid=;Max-Age=0']; // ✔ УДАЛЯЕМ cookie у клиента
    }
  }
  return user;
}

function getHtml(label, user) { // формируем HTML по шаблону
  let title = 'UNKNOWN',
    body = '<!-- default body -->';
  switch (label) {
    case 'info':
      body += '<ol><li>' + useful.map(x => `<${x.tag + ' ' + Object.entries(x.attr).map(([n, v]) => `${n}="${v}"`).join(' ')}>${x.innerHTML}</${x.tag}>`).join('</li>\n<li>') + '</li></ol>';
    case 'home':
    case 'about':
      title = label;
      body = `<h1>${title}</h1><hr>` + body;
      break;
    default:
      title = '?????';
  }
  return (
    `<!DOCTYPE html>
        <html>
            <head>
                <title>${title}</title>
                <link rel="icon" href="/favicon.ico" type="image/x-icon">
                <link rel="stylesheet" href="https://unpkg.com/mvp.css"><!-- https://andybrewer.github.io/mvp/  -->
                <style>nav{margin-bottom:0;}:root{font-size: small;}</style>
            </head>
            <body>
                <nav>
                  <ul><li><a href="/">Home</a></li><li><a href="/about">About</a></li><li><a href="/info">Info</a></li></ul>
                  ${user ? logoutForm(user) : loginForm()}
                </nav>
                ${body}<hr>
            </body>
        </html>`);
}

function loginForm() { // 💡 тут есть хитрость - при нажатии на кнопку "Submit (POST)" очищаем url.search при помощи JS History API см https://developer.mozilla.org/ru/docs/Web/API/History_API
  // иначе можем получить одновременно и GET и POST данные, что не является проблемой для это сервера, но может нас запутать
  return `<form>      
        <label>Name<input name="username"/></label><label>Password<input name="psw" type="password"/></label>
        <button type="submit">Submit</button><button type="submit" value="Submit (POST)" formmethod="post" onclick="let dl=document.location;history.replaceState(null,'',(new window.URL(dl.pathname,dl.origin)))">submit with post</button>
      </form>`;
}

function logoutForm(user) {
  return `<form>
        <h2>Hello, ${user.name}!!</h2>
        <input type="hidden" name="logout" value="true"><input type="submit" value="Выйти">
    </form>`;
}

const useful = [  // 📖 что почитать? - полезные ресурсы 
  { tag: 'img', attr: { src: 'https://studme.org/htm/img/15/1469/1.png' }, innerHTML: '' },
  { tag: 'a', attr: { href: 'https://ru.wikipedia.org/wiki/HTTP' }, innerHTML: 'Википедия:  HyperText Transfer Protocol — «протокол передачи гипертекста»' },
  { tag: 'a', attr: { href: 'https://developer.mozilla.org/ru/docs/Web/HTTP/Overview' }, innerHTML: 'MDN: Обзор протокола HTTP' },
  { tag: 'a', attr: { href: 'https://developer.mozilla.org/ru/docs/Web/HTTP/Status' }, innerHTML: 'MDN: Коды ответа HTTP' },
  { tag: 'a', attr: { href: 'https://developer.mozilla.org/ru/docs/Web/HTTP/Headers' }, innerHTML: 'MDN: Заголовки HTTP' },
  { tag: 'a', attr: { href: 'https://learn.javascript.ru/cookie' }, innerHTML: 'Learn JavaScript: Куки, document.cookie' },
  { tag: 'a', attr: { href: 'https://nodejs.org/en/docs/guides/anatomy-of-an-http-transaction/' }, innerHTML: 'NodeJS Docs: Anatomy of an HTTP Transaction' },
  { tag: 'a', attr: { href: 'https://nodejs.org/api/url.html#url_url_strings_and_url_objects' }, innerHTML: 'NodeJS Docs: URL strings and URL objects' },
  { tag: 'a', attr: { href: 'https://learn.javascript.ru/url' }, innerHTML: 'Learn JavaScript: Объекты URL' },
  { tag: 'a', attr: { href: 'https://ru.wikipedia.org/wiki/Favicon' }, innerHTML: 'Википедия: Favicon' },
  { tag: 'a', attr: { href: 'https://andybrewer.github.io/mvp/' }, innerHTML: 'mvp.css - No-Class CSS Framework' },
];
