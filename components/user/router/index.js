const router = require("express").Router();


router.get('/profile', async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.json(user);
});

router.put('/profile', async (req, res) => {
    const { name, lastName, phone, gender, dob } = req.body;

    const updatedUser = await prisma.user.update({
        where: { id: req.user.id },
        data: { name, lastName, phone, gender, dob },
    });

    res.json(updatedUser);
});

router.delete('/profile', async (req, res) => {
    await prisma.user.delete({ where: { id: req.user.id } });
    res.json({ message: 'Profile deleted successfully' });
});

module.exports = router;