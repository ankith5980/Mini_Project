import express, { Request, Response } from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { analyzeElement } from './services/llm';
import { AnalyzeRequest } from './types';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

app.post('/api/v1/analyze', async (req: Request, res: Response): Promise<void> => {
    try {
        const { elementHtml, parentHtml } = req.body as AnalyzeRequest;

        if (!elementHtml || !parentHtml) {
            res.status(400).json({ error: 'elementHtml and parentHtml are required' });
            return;
        }

        const result = await analyzeElement(elementHtml, parentHtml);
        res.json(result);
    } catch (error: any) {
        console.error('Analysis error:', error);
        res.status(500).json({ error: error.message || 'Internal server error during analysis' });
    }
});

app.listen(PORT, () => {
    console.log(`Backend server running on http://localhost:${PORT}`);
});
