const nodemailer = require('nodemailer');
const logger = require('../logger')
const { newEmail } = require('../mailsInDev')
const constants = require('../../config/constants')
const { errorResponse } = require("../../utils/responseUtils")
const fs = require('fs/promises')
const path = require('path')
const Handlebars = require('handlebars')
const { formatFromWithDisplayName } = require('./formatFromAddress')

// Register Handlebars helpers
Handlebars.registerHelper('eq', function(a, b) {
    return a === b;
});

let transporter;

if (process.env.EMAIL_TEST_MODE !== 'true') {
    const smtpPort = Number(process.env.EMAIL_PORT) || 2525;
    transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: smtpPort,
        // SMTPS on 465, STARTTLS on 587/2525. Defensive against later port changes.
        secure: smtpPort === 465,
        auth: {
            user: process.env.EMAIL_USERNAME,
            pass: process.env.EMAIL_PASSWORD
        },
        pool: true,
        maxConnections: Number(process.env.SMTP_MAX_CONNECTIONS || 25),
        maxMessages: Number(process.env.SMTP_MAX_MESSAGES || 1000),
        rateLimit: Number(process.env.SMTP_RATE_LIMIT || 50), // msgs/sec per process
        // Drop dead-feeling sockets before SendGrid/Postfix peer does.
        // Nodemailer defaults are too generous (socket=10min, conn=2min, greet=30s).
        connectionTimeout: Number(process.env.SMTP_CONN_TIMEOUT_MS || 15000),
        greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT_MS || 10000),
        socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT_MS || 30000),
        logger: logger.child({ child: 'nodemailer' }),
    });

    // Surface pool-level errors that aren't tied to an in-flight sendMail call.
    // Without this, a stray emit could become an unhandled rejection.
    transporter.on('error', (err) => {
        logger.error({
            err: { message: err?.message, code: err?.code, responseCode: err?.responseCode },
        }, 'SMTP pool error');
    });
}


module.exports = async (to, emailType, context = {}, attachments = []) => {
    try {
        // if unknown type, throw error
        if (!constants.emailTypes[emailType]) {
            throw {
                message: "Unknown email type",
                status: 400,
                emailType, to, emailContext: context
            }
        }
        // get data from config
        const emailConfig = constants.emailTypeData[emailType];
        const data = {
            from: formatFromWithDisplayName(emailConfig.from),
            to,
            subject: context.subject || (context.orderUniqueId ? `${emailConfig.subject} - #${context.orderUniqueId}` : emailConfig.subject),
            // subject: context.orderUniqueId ? `${emailConfig.subject} - #${context.orderUniqueId}` : emailConfig.subject,
        };

        if (attachments.length > 0) {
            data.attachments = attachments
        }

        // Gmail one-click unsubscribe (RFC 8058). Requires HOST_URL to be public HTTPS URL.
        const oneClickUnsubscribeTypes = ['PROMOTIONAL', 'PROMOTIONAL_NEWSLETTER', 'PRODUCT_UPDATES'];
        if (oneClickUnsubscribeTypes.includes(emailType)) {
            const recipient = Array.isArray(to) ? to[0] : to;
            if (recipient && process.env.HOST_URL) {
                const baseUrl = String(process.env.HOST_URL).replace(/\/$/, '');
                const unsubscribeUrl = `${baseUrl}/api/mailSubscription/unsubscribe?email=${encodeURIComponent(recipient)}`;
                data.headers = {
                    'List-Unsubscribe': `<${unsubscribeUrl}>`,
                    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
                };
            }
        }

        // Ensure email templates directory exists
        const templatesDir = path.join(__dirname, '../../emailTemplates');
        const templateDir = path.join(templatesDir, emailConfig.folderName);
        try {
            // Check if template directory exists
            await fs.access(templateDir);
        } catch (error) {
            logger.error(`Email template directory not found: ${templateDir}`);
            throw {
                message: "Email template directory not found",
                status: 500,
                emailType,
                templateDir
            }
        }

        // get template and replace content
        const textPath = path.join(templateDir, 'text.hbs');
        const htmlPath = path.join(templateDir, 'html.hbs');

        let text;
        let html;
        try {
            text = await fs.readFile(textPath, 'utf8');
            html = await fs.readFile(htmlPath, 'utf8');
        } catch (error) {
            throw {
                message: "Email template file read failed",
                status: 500,
                emailType,
                stage: 'template_read',
                textPath,
                htmlPath,
                error: error.message,
                code: error.code
            }
        }

        let templateContext;
        try {
            const emailEncoded =
                context.email != null && context.email !== ''
                    ? encodeURIComponent(String(context.email))
                    : '';
            templateContext = {
                ...context,
                host: process.env.HOST_URL,
                FRONTEND_URL: process.env.FRONTEND_URL,
                emailEncoded,
                currentYear: new Date().getFullYear()
            };
            data.text = Handlebars.compile(text)(templateContext);
            data.html = Handlebars.compile(html)(templateContext);
        } catch (error) {
            throw {
                message: "Email template render failed",
                status: 500,
                emailType,
                stage: 'template_render',
                error: error.message
            }
        }

        try {
            if (process.env.EMAIL_TEST_MODE === 'true') {
                return await newEmail(data);
            } else {
                return await transporter.sendMail(data);
            }
        } catch (error) {
            throw {
                message: "SMTP send failed",
                status: 500,
                emailType,
                stage: 'smtp_send',
                error: error.message,
                code: error.code,
                responseCode: error.responseCode
            }
        }
    } catch (error) {
        logger.error('Error in sendEmail:', {
            message: error?.message,
            stage: error?.stage,
            emailType: error?.emailType,
            code: error?.code,
            responseCode: error?.responseCode,
            error: error?.error,
            textPath: error?.textPath,
            htmlPath: error?.htmlPath
        });
        throw error;
    }
}
