export async function devDelay(ms: number = 1000): Promise<void> {
    if (process.env.NODE_ENV === "development") {
        await new Promise((resolve) => setTimeout(resolve, ms)); 
    }
}