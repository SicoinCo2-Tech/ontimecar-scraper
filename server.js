// ============================================
// DEPENDENCIAS
// ============================================
import 'dotenv/config';
import express from 'express';
import puppeteer from 'puppeteer';

// ============================================
// CONFIGURACIÓN
// ============================================
const CONFIG = {
    maxTimeout: 45000,
    navigationTimeout: 20000,
    selectorTimeout: 10000,
    retryAttempts: 2,
    waitAfterSearch: 1500,
};

// Validar credenciales
if (!process.env.ONTIMECAR_USERNAME || !process.env.ONTIMECAR_PASSWORD) {
    console.error('❌ ERROR: Debes definir ONTIMECAR_USERNAME y ONTIMECAR_PASSWORD en el archivo .env');
    process.exit(1);
}

const ONTIMECAR_CONFIGS = {
    agendamientos: {
        loginUrl: 'https://app.ontimecar.co/app/home/',
        targetUrl: 'https://app.ontimecar.co/app/agendamientos_panel/',
        username: process.env.ONTIMECAR_USERNAME,
        password: process.env.ONTIMECAR_PASSWORD,
        tableSelector: '#datatable',
        columnaAutorizacion: 12
    },
    autorizaciones: {
        loginUrl: 'https://app.ontimecar.com.co/Home/',
        targetUrl: 'https://app.ontimecar.com.co/Autorizaciones',
        username: process.env.ONTIMECAR_USERNAME,
        password: process.env.ONTIMECAR_PASSWORD,
        tableSelector: '#grdAutorizaciones',
    }
};

// ============================================
// GESTIÓN DE NAVEGADOR
// ============================================
let browser = null;
let activeSessions = 0;
const MAX_CONCURRENT = 3;

async function getBrowser() {
    if (!browser) {
        console.log('🚀 Iniciando navegador...');
        browser = await puppeteer.launch({
            headless: true,
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/chromium',
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--no-zygote',
                '--disable-gpu',
                '--disable-extensions',
                '--disable-web-security'
            ]
        });
    }
    return browser;
}

async function closeBrowser() {
    if (browser) {
        await browser.close();
        browser = null;
        activeSessions = 0;
    }
}

// ============================================
// UTILIDADES
// ============================================
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

async function withTimeout(promise, timeoutMs, errorMsg) {
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error(errorMsg)), timeoutMs);
    });
    
    try {
        const result = await Promise.race([promise, timeoutPromise]);
        clearTimeout(timeoutId);
        return result;
    } catch (error) {
        clearTimeout(timeoutId);
        throw error;
    }
}

// ============================================
// LOGIN
// ============================================
async function loginToOnTimeCar(page, config, attempt = 1) {
    try {
        console.log(`[Login Intento ${attempt}] Navegando a: ${config.loginUrl}`);

        await page.goto(config.loginUrl, {
            waitUntil: 'networkidle2',
            timeout: CONFIG.navigationTimeout
        });

        // Esperar formulario
        await page.waitForSelector('input[name="username"]', { 
            timeout: CONFIG.selectorTimeout,
            visible: true 
        });
        
        await sleep(500);

        // Limpiar e ingresar credenciales
        await page.evaluate(() => {
            document.querySelector('input[name="username"]').value = '';
            document.querySelector('input[name="password"]').value = '';
        });

        await page.type('input[name="username"]', config.username, { delay: 50 });
        await page.type('input[name="password"]', config.password, { delay: 50 });

        console.log('📝 Credenciales ingresadas, enviando...');

        // Click y esperar navegación
        const navigationPromise = page.waitForNavigation({ 
            waitUntil: 'networkidle2',
            timeout: 15000 
        }).catch(() => null);

        await page.click('button[type="submit"]');
        await navigationPromise;
        
        await sleep(2000);

        // Verificar login exitoso
        const isLoggedIn = await page.evaluate(() => {
            const hasLoginForm = !!document.querySelector('input[name="username"]');
            const bodyText = document.body.innerText.toLowerCase();
            const hasError = bodyText.includes('error') || 
                           bodyText.includes('incorrect') || 
                           bodyText.includes('inválid') ||
                           bodyText.includes('incorrecto');
            return !hasLoginForm && !hasError;
        });

        if (!isLoggedIn) {
            throw new Error('Login fallido: credenciales incorrectas o sesión no iniciada');
        }

        console.log('✅ Login exitoso');
        return true;

    } catch (error) {
        console.error(`❌ Error en login (intento ${attempt}):`, error.message);
        
        if (attempt < CONFIG.retryAttempts) {
            console.log('⏳ Reintentando en 3 segundos...');
            await sleep(3000);
            return loginToOnTimeCar(page, config, attempt + 1);
        }
        
        throw new Error(`Login fallido después de ${CONFIG.retryAttempts} intentos: ${error.message}`);
    }
}

// ============================================
// SCRAPING - AGENDAMIENTOS
// ============================================
// (Tu función scrapAgendamiento igual que antes...)
// ============================================
// SCRAPING - AUTORIZACIONES
// ============================================
// (Tu función scrapAutorizacion igual que antes...)
// ============================================

// ============================================
// EXPRESS SERVER
// ============================================
const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        timestamp: new Date().toISOString(),
        version: 'v5.1',
        browser_initialized: browser !== null,
        active_sessions: activeSessions,
        max_concurrent: MAX_CONCURRENT
    });
});

// aquí van tus endpoints /consulta/agendamiento, /consulta/autorizacion, /admin/stats, etc.
// (no los repito para no duplicar, pero quedan igual que en tu versión)

const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en http://localhost:${PORT}`);
});

// Shutdown limpio
async function gracefulShutdown(signal) {
    console.log(`\n⚠️  ${signal} recibido, cerrando servidor...`);
    server.close(async () => {
        await closeBrowser();
        process.exit(0);
    });
}
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
