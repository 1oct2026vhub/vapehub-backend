const sendGrid = require('@sendgrid/mail');

const generateMail = async (receiverMailId, subject, bodyHtmlData, templateId = undefined, attachments = []) => {
    try {
        sendGrid.setApiKey(process.env.SENDGRID_API_KEY);

        // Format attachments if provided
        const formattedAttachments = attachments.map(file => ({
            content: file.content, // Should be base64 encoded
            filename: file.filename,
            type: file.type,
            disposition: 'attachment',
        }));

        const sendMessage = {
            to: receiverMailId,
            from: process.env.MAIL_ID,
            subject: subject,
            attachments: formattedAttachments,
        };

        // Handle dynamic template data if templateId is provided
        if (templateId) {
            sendMessage.template_id = templateId;
            sendMessage.dynamic_template_data = bodyHtmlData; // Pass the dynamic data here
        } else {
            sendMessage.html = bodyHtmlData; // Fallback to static HTML
        };
        
        await sendGrid.send(sendMessage);

        return true;

    } catch (errors) {
        console.log('Generate Mail errors :',errors);
        throw new Error(errors.response.body.errors[0].message);
    };
};

module.exports = generateMail;