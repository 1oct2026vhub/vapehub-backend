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

// get template and replace content
const text = await fs.readFile(path.join(__dirname, '../../emailTemplates', emailConfig.folderName, 'text.hbs'), 'utf8')
const html = await fs.readFile(path.join(__dirname, '../../emailTemplates', emailConfig.folderName, 'html.hbs'), 'utf8')
data.text = Handlebars.compile(text)({ ...context, host: process.env.HOST_URL, FRONTEND_URL:process.env.FRONTEND_URL })
data.html = Handlebars.compile(html)({ ...context, host: process.env.HOST_URL, FRONTEND_URL:process.env.FRONTEND_URL, currentYear: new Date().getFullYear()})

// send email
if (process.env.EMAIL_TEST_MODE === 'true')
    return await newEmail(data)
else
    return await transporter.sendMail(data)
}
