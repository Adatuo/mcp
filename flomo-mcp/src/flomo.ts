export class FlomoClient {
    private readonly apiUrl: string;

    /**
     * 构造函数
     * @param apiUrl
     */

    constructor({ apiUrl }: {
        apiUrl: string
    }) {
        this.apiUrl = apiUrl;
    }

    /**
     * 写笔记的方法
     * @param content 
     * @returns 记录API响应内容
     */

    async writeNote({ content }: { content: string }) {
        try {
            if (!content) {
                throw new Error("invalid content")
            }

            const req = {
                content
            }
            const res = await fetch(this.apiUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(req)
            })
            if (!res.ok) {
                throw new Error(`request failed with status ${res.statusText}`)
            }
            return res.json()

        } catch (e) {
            throw e
        }
    }
}