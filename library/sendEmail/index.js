const nodemailer = require('nodemailer');
const logger = require('../logger')
const utilsLogger = require('../../utils/logger');
const { newEmail } = require('../mailsInDev')
const constants = require('../../config/constants')
const { errorResponse } = require("../../utils/responseUtils")
const fs = require('fs/promises')
const path = require('path')
const Handlebars = require('handlebars')

let transporter;

if (process.env.EMAIL_TEST_MODE !== 'true') {
    transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT || 2525,
        auth: {
            user: process.env.EMAIL_USERNAME,
            pass: process.env.EMAIL_PASSWORD
        },
        logger: logger.child({ child: 'nodemailer' }),
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
            from: emailConfig.from,
            to,
            subject: context.orderUniqueId ? `${emailConfig.subject} - #${context.orderUniqueId}` : emailConfig.subject,
        };

        if (attachments.length > 0) {
            data.attachments = attachments
        }

        // Log email configuration and data
        utilsLogger.logInfo({
            type: 'email_config',
            data: {
                emailType,
                emailConfig,
                data,
                timestamp: new Date().toISOString()
            }
        });

        // Ensure email templates directory exists
        const templatesDir = path.join(__dirname, '../../emailTemplates');
        const templateDir = path.join(templatesDir, emailConfig.folderName);
        // Log email configuration and data
        utilsLogger.logInfo({
            type: 'email_config',
            data: {
                templatesDir,
                templateDir,
                folderName:emailConfig.folderName,
                timestamp: new Date().toISOString()
            }
        });
        try {
            // Check if template directory exists
            await fs.access(templateDir);
        } catch (error) {
            logger.error(`Email template directory not found: ${templateDir}`);
            utilsLogger.logError({
                type: 'email_template_error',
                data: {
                    error: error.message,
                    emailType,
                    templateDir,
                    timestamp: new Date().toISOString()
                }
            });
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
        try {
            const text = await fs.readFile(textPath, 'utf8');
            const html = await fs.readFile(htmlPath, 'utf8');
            data.text = Handlebars.compile(text)({ 
                ...context, 
                host: process.env.HOST_URL, 
                FRONTEND_URL: process.env.FRONTEND_URL 
            });
            
            data.html = Handlebars.compile(html)({ 
                ...context, 
                host: process.env.HOST_URL, 
                FRONTEND_URL: process.env.FRONTEND_URL, 
                currentYear: new Date().getFullYear()
            });

            // Log email sending attempt
            utilsLogger.logInfo({
                type: 'sending_email',
                data: {
                    to,
                    emailType,
                    subject: data.subject,
                    templateDir: emailConfig.folderName,
                    timestamp: new Date().toISOString()
                }
            });

            // send email
            if (process.env.EMAIL_TEST_MODE === 'true') {
                return await newEmail(data);
            } else {
                return await transporter.sendMail(data);
            }
        } catch (error) {
            logger.error(`Error reading email templates: ${error.message}`);
            utilsLogger.logError({
                type: 'email_template_read_error',
                data: {
                    error: error.message,
                    emailType,
                    templateDir,
                    textPath,
                    htmlPath,
                    context: context,
                    partials: {
                        footer: path.join(templatesDir, 'partials/footer.hbs'),
                        header: path.join(templatesDir, 'partials/header.hbs')
                    },
                    templateStructure: {
                        mainTemplate: emailConfig.folderName,
                        partialsDir: path.join(templatesDir, 'partials'),
                        exists: {
                            textTemplate: fs.existsSync(textPath),
                            htmlTemplate: fs.existsSync(htmlPath),
                            footerPartial: fs.existsSync(path.join(templatesDir, 'partials/footer.hbs')),
                            headerPartial: fs.existsSync(path.join(templatesDir, 'partials/header.hbs'))
                        }
                    },
                    timestamp: new Date().toISOString()
                }
            });
            throw {
                message: "Error reading email templates",
                status: 500,
                emailType,
                error: error.message
            }
        }
    } catch (error) {
        logger.error(`Error in sendEmail: ${error.message}`);
        utilsLogger.logError({
            type: 'email_send_error',
            data: {
                error: error.message,
                emailType,
                to,
                timestamp: new Date().toISOString()
            }
        });
        throw error;
    }
}
