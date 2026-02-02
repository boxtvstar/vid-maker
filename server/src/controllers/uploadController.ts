import { Request, Response } from 'express';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const uploadStyleImage = (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: 'No file uploaded' });
    }

    // 파일 URL 생성 (서버 주소 기준)
    const protocol = req.protocol;
    const host = req.get('host');
    const folder = req.file.destination.split(path.sep).pop(); // 'styles' or 'audio'
    const imageUrl = `${protocol}://${host}/uploads/${folder}/${req.file.filename}`;

    res.json({
      success: true,
      imageUrl,
      filename: req.file.filename
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
};
