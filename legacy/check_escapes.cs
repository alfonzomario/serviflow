using System;
using System.IO;

public class Prog {
    public static void Main() {
        string logPath = @"C:\Users\javie\.gemini\antigravity\brain\ffcd8421-919d-4ceb-b6a8-562b39c452b2\.system_generated\logs\transcript_full.jsonl";
        string fullText = File.ReadAllText(logPath);
        int lineEnd = fullText.IndexOf('\n');
        string line = lineEnd != -1 ? fullText.Substring(0, lineEnd) : fullText;
        
        int htmlIdx = line.IndexOf("index.html:");
        if (htmlIdx == -1) return;
        string rawHtml = line.Substring(htmlIdx + 11);
        int endReq = rawHtml.IndexOf("</USER_REQUEST>");
        if (endReq != -1) rawHtml = rawHtml.Substring(0, endReq);
        
        // Count escaped backticks in the raw JSON
        int escapedBackticks = rawHtml.Split(new string[] { "\\`" }, StringSplitOptions.None).Length - 1;
        Console.WriteLine("Escaped backticks in original JSON: " + escapedBackticks);
        
        // Count unicode escaped backticks \u0060
        int unicodeBackticks = rawHtml.Split(new string[] { "\\u0060" }, StringSplitOptions.None).Length - 1;
        Console.WriteLine("Unicode backticks in original JSON: " + unicodeBackticks);
    }
}
