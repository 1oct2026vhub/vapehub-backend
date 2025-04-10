const nodemailer = require('nodemailer');
const logger = require('../logger')
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
            subject: emailConfig.subject,
        };

        if (attachments.length > 0) {
            data.attachments = attachments
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
            // send email
            if (process.env.EMAIL_TEST_MODE === 'true') {
                return await newEmail(data);
            } else {
                return await transporter.sendMail(data);
            }
        } catch (error) {
            logger.error(`Error reading email templates: ${error.message}`);
            throw {
                message: "Error reading email templates",
                status: 500,
                emailType,
                error: error.message
            }
        }
    } catch (error) {
        logger.error(`Error in sendEmail: ${error.message}`);
        throw error;
    }
}
