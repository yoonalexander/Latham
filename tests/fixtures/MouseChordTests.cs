using System;
using System.Collections.Generic;

static class MouseChordTests {
    static readonly List<string> events = new List<string>();
    static MouseChord chord;

    static void Expect(string expected) {
        string actual = string.Join(",", events);
        if (actual != expected) throw new Exception("Expected '" + expected + "', got '" + actual + "'");
        events.Clear();
    }

    static void Button(int button, bool down, bool injected = false, bool otherPressed = false) {
        chord.Button(button, down, injected, () => otherPressed);
    }

    static void Main() {
        foreach (int first in new[] { 1, 2 }) {
            int second = 3 - first;
            chord = new MouseChord(events.Add);
            Button(first, true);
            Button(first, true);
            Expect("");
            Button(second, true);
            Button(second, true);
            Expect("down");
            Button(first, false);
            Button(second, false);
            Expect("up");
        }

        chord = new MouseChord(events.Add);
        chord.Reconcile(1); // Started with a button held.
        Button(2, true);
        chord.Reconcile(2);
        chord.Reconcile(0);
        Expect("");

        Button(1, true);
        Button(2, true, otherPressed: true);
        Button(2, false);
        Expect("");
        Button(2, true, injected: true);
        Button(2, true);
        Expect("");
        chord.Reconcile(0);

        Button(1, true);
        Button(2, true);
        Button(2, false, injected: true);
        Button(1, false);
        Expect("down,cancel");
        chord.Reconcile(0);

        Button(1, true);
        Button(2, true);
        chord.Reconcile(1); // Windows registered a release the hook missed.
        Button(2, false);
        Expect("down,cancel");
        chord.Reconcile(0);

        Button(1, true);
        Button(2, true);
        chord.Cancel();
        Button(2, true);
        Button(2, false);
        Button(1, false);
        Expect("down,cancel");
    }
}
