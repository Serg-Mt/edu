const myName = `My Little HTTP Server`,
    port = 3000;
// учебный пример того, что может уметь HTTP-сервер,

// конкретно этот умеет:
// ✔ роутинг
// ✔ обработку данных форм
// ✔ читает и устанавливает cookie 

// запуск: node mlserv.js
// далее заходим браузером на страницу http://localhost:3000

// ВНИМАНИЕ!!! функции аутентификации намеренно наивны и не предназначены для использования, даже как каркас
// Это только примитивная демонстрация того, как на коленке написать сервер на nodejs,
// и имеет смысл только вместе с занятиями на которых разбирается...
// да, и никакого "отлова" ошибок, только хардкор!!!

import { createServer, STATUS_CODES } from 'http'
import { URL } from 'url'
import { parse as parsePath } from 'path'
import { parse as parseCookie } from 'cookie'         // https://www.npmjs.com/package/cookie

const
    DB = {                      // нелепая пародия на базу данных
        accounts: {
            user: { pass: '123', name: '👤USER' },   // это логины + пароли пользователей 
            admin: { pass: '321', name: '👑ADMIN' }, // да да, прям так... никого не стесняемся :)
        },
        online: {},                                 // а тут будем хранить сессии пользователей
        delOnlineUser(uid) { delete this.online[uid] },
        getUserByCookie(uid) { return this.online?.[uid] },
        loginUser(login, pass) {
            let testUser = this.accounts?.[login];
            if (pass && testUser && pass === testUser?.pass) {
                let UID = this.newUID();
                this.online[UID] = testUser;
                return UID;
            }
            return false
        },
        newUID() { return Math.random() }
    },
    server = createServer((request, response) => { // request - объект полученного запроса, response - объект ответа который будет отправлен, см https://nodejs.org/en/docs/guides/anatomy-of-an-http-transaction/
        console.log((new Date()).toLocaleTimeString(), request.method, request.url, 'HTTP/' + request.httpVersion);

        let { code, responseHeaders, html } = getAnswer(
            new URL(request.url, `http://${request.headers.host}`), // разберем URL на части, подробней тут https://nodejs.org/api/url.html#url_url_strings_and_url_objects
            request.headers
        );
        response.statusCode = code; // начинаем формировать ответ, первым делом отправляем status code
        response.setHeader('Content-Type', 'text/html; charset=utf-8'); // заголовок см. https://developer.mozilla.org/ru/docs/Glossary/MIME_type
        responseHeaders && Object.entries(responseHeaders)?.forEach(([name, val]) => response.setHeader(name, val));
        response.write(html);
        response.end();    // завершаем ответ и отправляем его клиенту
    });

server.listen(port, () => {
    console.log(`Server start at http://localhost:` + port);
});

function getAnswer(url, inHeaders) {
    // >> получает url и заголовки_запроса 
    // << возвращает ответ состоящий из:
    //     status code см. https://developer.mozilla.org/ru/docs/Web/HTTP/Status
    //     заголовков см. https://developer.mozilla.org/ru/docs/Web/HTTP/Headers
    //     тела ответа (зачастую это сам HTML)
    let
        responseHeaders = { Server: myName }, // это объект для  заголовков ответа
        cookies = parseCookie(inHeaders.cookie || ''), //  см. https://www.npmjs.com/package/cookie#cookieparsestr-options
        user = getUser(cookies, url.searchParams, responseHeaders); // получаем пользователя на основе cookies и данных формы 

    // ✔ РОУТИНГ !!! ветвление в зависимости от pathname называют routing или маршрутизация
    let path = parsePath(url.pathname);
    switch (path.dir) {
        case '/teststatus':    // пасхалка :)
            return { code: +path.name, html: `<h1>${path.name}</h1><h2>${STATUS_CODES[path.name]}</h2><a href='${+path.name - 1}'>&lt;&lt;${+path.name - 1}</a>&emsp;<a href='${+path.name + 1}'>${+path.name + 1}&gt;&gt;</a>`, responseHeaders }
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

function getUser(cookies, searchParams, responseHeaders) { // получаем пользователя по cookies или даннным html-формы
    let user = {}; // главное в этой функции
    if (isNotEmptyObject(cookies)) console.log('\t cookies:', cookies);

    // ✔ ЧИТАЕМ cookies
    if (cookies.uid) { // проверим не залогинен ли уже пользователь?
        let testUser = DB.getUserByCookie(cookies.uid);
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
            console.log(`\t login ${username}/${psw} user=${user.name}`);
        }
        if (searchParams.has('logout')) {  // если пожелаешь мы тебя разлогиним
            console.log(`\t logout user=${user.name}`);
            DB.delOnlineUser(cookies.uid);
            user = false;
            responseHeaders['Set-Cookie'] = [`uid=;Max-Age=0`]; // ✔ УДАЛЯЕМ cookie у клиента            
        }
    }
    return user;
}

function getHtml(label, user) {
    let title = 'UNKNOWN',
        body = '<!-- defalt body -->';
    switch (label) {
        case 'info':
            body += `<ol><li>` + useful.map(x => `<${x.tag + ' ' + Object.entries(x.attr).map(([n, v]) => `${n}="${v}"`).join(' ')}>${x.innerHTML}</${x.tag}>`).join('</li>\n<li>') + `</li></ol>`;
        case 'home':
        case 'about':
            title = label;
            body = `<h1>${title}</h1>` + body;
            break;
        default:
            title = '?????'
    }
    return (
        `<!DOCTYPE html>
        <html>
            <head>
                <title>${title}</title>
                <link rel="icon" href="/favicon.ico" type="image/x-icon">
                <link rel="stylesheet" href="https://unpkg.com/mvp.css"><!-- https://andybrewer.github.io/mvp/  -->
                <style>nav{margin-bottom:0;}</style>
            </head>
            <body>
                <nav><ul><li><a href="/">Home</a></li><li><a href="/about">About</a></li><li><a href="/info">Info</a></li></ul></nav>
                ${user?.name ? logoutForm(user) : loginForm()}
                ${body}
                <hr>
            </body>
        </html>`)
}

function loginForm() {
    return '<form><label>Name<input name="username"/></label><label>Password<input name="psw" type="password"/></label><input type="submit"/></form>';
}

function logoutForm(user) {
    return `<form>
        <h2>Hello, ${user.name}!!</h2>
        <input type="hidden" name="logout" value="true"><input type="submit" value="Выйти">
    </form>`
}

function isNotEmptyObject(obj) {
    return Object.keys(obj).length != 0;
}

const useful = [  // что почитать? - полезные ресурсы
    { tag: 'img', attr: { src: `https://studme.org/htm/img/15/1469/1.png` }, innerHTML: '' },
    { tag: 'a', attr: { href: `https://ru.wikipedia.org/wiki/HTTP` }, innerHTML: `Википедия:  HyperText Transfer Protocol — «протокол передачи гипертекста»` },
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