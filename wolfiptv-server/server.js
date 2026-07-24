const express = require("express");
const axios = require("axios");
const cors = require("cors");

const app = express();

app.use(cors());
app.use(express.json());

app.post("/api/xtream", async (req, res) => {
    try {
        const { url } = req.body;

        const response = await axios.get(url, {
            timeout: 15000,
            responseType: "stream"
        });

        response.data.pipe(res);

    } catch (e) {

        res.status(500).json({
            error: e.message
        });

    }
});

app.listen(3000, () => {
    console.log("Proxy iniciado en puerto 3000");
});