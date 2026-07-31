using System;
using System.IO;

public class Prog {
    public static void Main() {
        string[] lines = File.ReadAllLines(@"C:\Users\javie\.gemini\antigravity\scratch\lozanor-app\index.html");
        int backtickCount = 0;
        for (int i = 153; i < 299; i++) { // Lines 154 to 299 (index 153 to 298)
            foreach (char c in lines[i]) {
                if (c == '`') backtickCount++;
            }
        }
        Console.WriteLine("Backticks between line 154 and 299: " + backtickCount);
    }
}
