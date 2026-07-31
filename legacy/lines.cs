using System;
using System.IO;

public class Prog {
    public static void Main() {
        string[] lines = File.ReadAllLines(@"C:\Users\javie\.gemini\antigravity\scratch\lozanor-app\index.html");
        int backtickCount = 0;
        for (int i = 0; i < lines.Length; i++) {
            foreach (char c in lines[i]) {
                if (c == '`') backtickCount++;
            }
            if (lines[i].Contains("Date.parse")) {
                Console.WriteLine("Line " + (i+1) + " (ticks=" + backtickCount + "): " + lines[i]);
            }
        }
    }
}
